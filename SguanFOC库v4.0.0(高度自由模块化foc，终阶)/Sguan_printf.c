#include "Sguan_Printf.h"

/* SguanFOC配置文件声明 */
#include "UserData_Driver.h"
#include "UnitLib_UserControl.h"
#include <stdio.h>
#include <string.h>

/* 内部私有变量与静态函数声明 */
uint8_t sguan_printfbuff[64];
static uint32_t hash_compute(const char *str, uint8_t len);
static float get_data_fast(uint8_t start_idx);
static void printf_adjust(void);


/* ==================== 哈希/字典映射实现 =================== */

/**
 * @brief  轻量级字符串哈希函数 (经典 DJB2 算法)
 * @param  str: 待计算哈希的字符串指针 (指令键名，如 "Speed", "Id")
 * @param  len: 字符串长度
 * @retval 32 位无符号整数哈希值
 * @note   数学公式: hash_i = hash_{i-1} * 33 + char
 *         位运算实现: ((hash << 5) + hash) + str[i]，初始种子为 5381。
 *         该算法具备优良的离散雪崩效应与极低的碰撞率，专为单片机 O(1) 字符串快速匹配设计。
 */
static uint32_t hash_compute(const char *str, uint8_t len){
    uint32_t hash = 5381;
    for (uint8_t i = 0; i < len; i++) {
        hash = ((hash << 5) + hash) + str[i]; 
    }
    return hash;
}

// 指令字典条目总数
#define DICT_COUNT (sizeof(cmd_dict) / sizeof(CmdMap))

/**
 * @brief  极速无依赖浮点数解析 (单遍扫描 + 异常字符熔断截断)
 * @param  start_idx: 缓冲区中数值开始扫描的起始字符下标 (等号后的第一位)
 * @retval 解析出的单精度浮点数值 (float)
 * @note   杜绝在实时控制系统中调用高开销的标准库 sscanf() 或 atof()：
 *         1. 符号检测: 支持正负号识别;
 *         2. 整数与小数分离解析: 小数部分按位累乘 0.1 衰减权重;
 *         3. 异常截断保护: 若遇到非数字或非法字符立刻 break，防止粘包卡死。
 */
static float get_data_fast(uint8_t start_idx){
    float result = 0.0f;
    float frac_weight = 0.1f;
    uint8_t i = start_idx;
    int8_t sign = 1;
    uint8_t in_fraction = 0;

    // 1. 负号判断
    if (sguan_printfbuff[i] == '-'){
        sign = -1;
        i++;
    }

    // 2. 遍历字符直至遇到帧尾 '?' 或字符串结尾 '\0'
    while (sguan_printfbuff[i] != '?' && sguan_printfbuff[i] != '\0' && i < 200){
        uint8_t c = sguan_printfbuff[i];
        
        if (c == '.') {
            in_fraction = 1; // 进入小数位扫描
        } else if (c >= '0' && c <= '9'){
            if (!in_fraction) {
                // 整数位累加: result = result * 10 + digit
                result = result * 10.0f + (c - '0');
            } else {
                // 小数位累加: result = result + digit * weight
                result += (c - '0') * frac_weight;
                frac_weight *= 0.1f;
            }
        } else {
            // 遭遇异常字符（如粘包字母），立即截断返回当前结果，防止死循环
            break; 
        }
        i++;
    }
    return result * (float)sign;
}

/**
 * @brief  [接收端] 实时参数热调整核心函数 (DJB2 哈希查表与指令分发)
 * @note   通信协议格式: "键名=数值?" (例如: "Speed=1200.5?")
 *         流程:
 *         1. 扫描等号确定 Key 长度;
 *         2. 调用 get_data_fast 提取等号后的浮点参数值;
 *         3. 计算 Key 的 DJB2 哈希值;
 *         4. 在预先生成的 cmd_dict 字典中进行纯整数比对 (O(1) 速度);
 *         5. 若哈希命中且字符串二次比对一致，立即调用绑定的回调函数注入参数;
 *         6. 清空接收缓冲区，复位接收状态。
 */
static void printf_adjust(void){
    uint8_t eq_pos = 0;
    
    // 1. 寻找等号位置，确定指令 Key 的长度
    while (sguan_printfbuff[eq_pos] != '=' && eq_pos < 50){
        if (sguan_printfbuff[eq_pos] == '\0') return; // 未找到等号，非法指令丢弃
        eq_pos++;
    }

    // 2. 极速提取等号后面的数值
    float data_val = get_data_fast(eq_pos + 1);

    // 3. 计算当前接收到指令 Key 的 32 位哈希值
    uint32_t rx_hash = hash_compute((const char*)sguan_printfbuff, eq_pos);

    // 4. 哈希查表匹配 (纯 32 位整数比较，指令命中耗时极短)
    for (uint8_t i = 0; i < DICT_COUNT; i++){
        if (cmd_dict[i].hash_val == rx_hash){
            // 严谨起见: 防止发生极低概率的哈希碰撞，二次确认字符串全字匹配
            if (strncmp((char*)sguan_printfbuff, cmd_dict[i].name, eq_pos) == 0){
                if (cmd_dict[i].callback != NULL) {
                    // 执行该指令绑定的用户控制回调 (如改变目标速度、电流、模式)
                    cmd_dict[i].callback(data_val);
                }
                break;
            }
        }
    }

    // 5. 清理缓冲区，准备接收下一帧
    memset(sguan_printfbuff, 0, sizeof(sguan_printfbuff));
}

/* ==================== 通用 Loop 函数 =================== */

/**
 * @brief  JustFloat 虚拟示波器协议发送初始化
 * @param  str: 示波器发送数据帧结构体指针
 * @note   JustFloat 协议标准尾同步字为 0x00, 0x00, 0x80, 0x7F (单精度浮点数 NaN 编码)，
 *         上位机通过捕获该特定 4 字节标识帧尾并同步多通道浮点波形。
 */
void printf_tx_init(Printf *str){
    str->tail[0] = 0x00;
    str->tail[1] = 0x00;
    str->tail[2] = 0x80;
    str->tail[3] = 0x7f;
}

/**
 * @brief  JustFloat 示波器数据周期性发送钩子
 * @param  str: 待发送的数据帧指针
 */
void printf_tx_loop(Printf *str){
    // 用户可在此调用底层硬件串口 DMA 发送函数
    // User_CorrespondSet((uint8_t *)str, sizeof(Printf));
}

/**
 * @brief  开机指令字典哈希初始化
 * @note   在系统初始化时被调用一次，预先遍历 cmd_dict 数组，
 *         将所有指令字符串离线转换为固定哈希值缓存在 cmd_dict[i].hash_val 中。
 */
void printf_rx_init(void){
    for (uint8_t i = 0; i < DICT_COUNT; i++){
        uint8_t len = strlen(cmd_dict[i].name);
        cmd_dict[i].hash_val = hash_compute(cmd_dict[i].name, len);
    }
}

/**
 * @brief  串口数据流接收与帧解包状态机
 * @param  data: 串口接收缓冲区数据指针
 * @param  length: 接收字节数
 * @note   流式处理特性:
 *         1. 自动过滤掉 \r, \n, 空格等非关键通信干扰字符;
 *         2. 遇到终结符 '?' 时触发指令解析 printf_adjust();
 *         3. 熔断防粘包机制: 若无 '?' 且堆积超过 40 字节，主动清空缓冲区，防死滞溢出。
 */
void printf_rx_loop(uint8_t *data, uint16_t length){
    static uint16_t buff_ptr = 0;
    
    for (uint16_t i = 0; i < length; i++){
        uint8_t ch = data[i];

        // 1. 过滤: 忽略换行、回车、空格等干扰符
        if (ch == '\r' || ch == '\n' || ch == ' '){
            continue;
        }
        
        sguan_printfbuff[buff_ptr++] = ch;
        
        // 2. 遇到帧尾 '?' 触发解析派发
        if (ch == '?') {
            printf_adjust();
            buff_ptr = 0; // 重置写入指针
            continue;
        }
        
        // 3. 熔断保护 (防粘包 / 缓冲区死滞溢出)
        // 超过 40 字节还没收到 '?' 则判定为残帧，强制清空重置
        if (buff_ptr >= 40) {
            memset(sguan_printfbuff, 0, sizeof(sguan_printfbuff));
            buff_ptr = 0;
        }
    }
}
