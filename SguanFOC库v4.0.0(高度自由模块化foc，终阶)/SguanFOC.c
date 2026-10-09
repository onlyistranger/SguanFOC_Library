#include "SguanFOC.h"

/* SguanFOC配置文件声明 */
#include "UnitLib_main.h"

/* 静态内部私有调度函数声明 */
static void sguanfoc_high_loop(SguanFoc *sguan);
static void sguanfoc_low_loop(SguanFoc *sguan);
static void sguanfoc_printf_loop(uint8_t *data, uint16_t length);
static void sguanfoc_main_loop(SguanFoc *sguan);

/* ========================================================================= */
/*                   多电机 X-Macro 元编程 (1 ~ 6 轴电机自动扩展)              */
/* ========================================================================= */
// 1. 宏拼接助手：将 LIST_ 与宏 CONFIG_MOTOR 拼接，得到对应长度的展开宏
#define CONCAT(a, b) a##b
#define EXPAND_MOTOR(n) CONCAT(LIST_, n)

// 定义支持 1 到 6 轴电机的元列表展开序列
#define LIST_1  X(0)
#define LIST_2  X(0) X(1)
#define LIST_3  X(0) X(1) X(2)
#define LIST_4  X(0) X(1) X(2) X(3)
#define LIST_5  X(0) X(1) X(2) X(3) X(4)
#define LIST_6  X(0) X(1) X(2) X(3) X(4) X(5)

// 2. 根据编译期宏 CONFIG_MOTOR (在 Sguan_Config.h 中配置) 展开得到当前系统电机列表
#define MOTOR_LIST EXPAND_MOTOR(CONFIG_MOTOR)

// 3. 模板函数生成宏：为每个电机实例自动生成无参的中断包装函数
// 这样在硬件中断向量表（如 TIM1_UP_IRQHandler）中可以直接绑定 high_loop_0()，无函数指针寻址开销
#define MAKE_MOTOR_FUNCS(n) \
    static void high_loop_##n(void); \
    static void low_loop_##n(void); \
    static void main_loop_##n(void); \
    \
    /* 电机 n 的高频中断入口：获取实例指针并调用统一高频调度器 */ \
    static void high_loop_##n(void) { \
        SguanFoc *p = &sguanfoc[n]; \
        sguanfoc_high_loop(p); \
    } \
    /* 电机 n 的低频任务入口：获取实例指针并调用低频保护状态机 */ \
    static void low_loop_##n(void) { \
        SguanFoc *p = &sguanfoc[n]; \
        sguanfoc_low_loop(p); \
    } \
    /* 电机 n 的后台主循环入口：处理非实时低优先级任务 */ \
    static void main_loop_##n(void) { \
        SguanFoc *p = &sguanfoc[n]; \
        sguanfoc_main_loop(p); \
    }

// 4. 应用 X-Macro 宏展开，批量自动生成电机 0 ~ (CONFIG_MOTOR-1) 的函数定义
#define X(n) MAKE_MOTOR_FUNCS(n)
MOTOR_LIST
#undef X

// 5. 全局电机控制对象数组初始化：为每个轴分配固定的 ID 与函数指针
SguanFoc sguanfoc[CONFIG_MOTOR] = {
    #define X(n) { \
        .id_flag = n, \
        .func_high_loop = high_loop_##n, \
        .func_low_loop = low_loop_##n, \
        .func_printf_loop = sguanfoc_printf_loop, \
        .func_main_loop = main_loop_##n \
    },
    MOTOR_LIST
    #undef X
};


/**
 * @brief  SguanFOC 高频中断总分发函数 (Current Loop / Angle / PWM)
 * @param  sguan: 当前触发中断的电机控制句柄指针
 * @note   通常在 PWM 载波下溢或更新中断中被调用 (执行频率 10kHz ~ 40kHz)。
 *         多轴模式下依据 id_flag 分发至各轴独立的专有高速算法，单轴直接调用统一高频环。
 */
static void sguanfoc_high_loop(SguanFoc *sguan){
    #if CONFIG_MOTOR >= 0x02
    // 多电机配置：根据电机物理轴编号分发
    switch (sguan->id_flag){
    case MOTOR_ONE:
        unitlib_main_high_loop_one(sguan);   // 电机 1 高频控制环
        break;
    case MOTOR_TWO:
        unitlib_main_high_loop_two(sguan);   // 电机 2 高频控制环
        break;
    case MOTOR_THREE:
        unitlib_main_high_loop_three(sguan); // 电机 3 高频控制环
        break;
    case MOTOR_FOUR:
        unitlib_main_high_loop_four(sguan);  // 电机 4 高频控制环
        break;
    case MOTOR_FIVE:
        unitlib_main_high_loop_five(sguan);  // 电机 5 高频控制环
        break;
    case MOTOR_SIX:
        unitlib_main_high_loop_six(sguan);   // 电机 6 高频控制环
        break;
    
    default:
        break;
    }
    #else // CONFIG_MOTOR == 1 单电机配置
    // 单轴模式：直接执行通用高频控制环，消除分支开销
    unitlib_main_high_loop(sguan);
    #endif // CONFIG_MOTOR
}

/**
 * @brief  SguanFOC 低频节拍总分发函数 (State Machine / Protection / Temperature)
 * @param  sguan: 当前电机控制句柄指针
 * @note   通常在 SysTick 或低频定时器中断中调用 (执行频率 100Hz ~ 1kHz)。
 *         内部负责打包遥测参数（电压、母线电流、温度）并喂入 196 项有限状态机。
 */
static void sguanfoc_low_loop(SguanFoc *sguan){
    unitlib_main_low_loop(sguan);
}

/**
 * @brief  串口通信与调参解析循环
 * @param  data: 串口接收 DMA 缓冲区指针
 * @param  length: 本次接收到的有效数据字节长度
 * @note   采用懒加载设计：初次接收到数据时自动初始化 DJB2 字符串哈希表，
 *         之后通过非阻塞极速哈希匹配解析上位机下发的控制命令。
 */
static void sguanfoc_printf_loop(uint8_t *data, uint16_t length){
    static uint8_t count = 0;
    // 首次进入时执行哈希表预计算
    if (count == 0){
        printf_rx_init();
        count = 1;
    }
    // 喂入接收数据流，执行分包、粘包截断与哈希命令派发
    printf_rx_loop(data, length);
}

/**
 * @brief  非实时主循环后台任务
 * @param  sguan: 当前电机控制句柄指针
 * @note   在 main() 中的 while(1) 大循环中调用，负责非实时的监控、LED指示与低优先级逻辑
 */
static void sguanfoc_main_loop(SguanFoc *sguan){
    #if CONFIG_MOTOR >= 0x02
    switch (sguan->id_flag){
    case MOTOR_ONE:
        unitlib_main_main_loop_one(sguan);
        break;
    case MOTOR_TWO:
        unitlib_main_main_loop_two(sguan);
        break;
    case MOTOR_THREE:
        unitlib_main_main_loop_three(sguan);
        break;
    case MOTOR_FOUR:
        unitlib_main_main_loop_four(sguan);
        break;
    case MOTOR_FIVE:
        unitlib_main_main_loop_five(sguan);
        break;
    case MOTOR_SIX:
        unitlib_main_main_loop_six(sguan);
        break;
    
    default:
        break;
    }
    #else // CONFIG_MOTOR == 1
    unitlib_main_main_loop(sguan);
    #endif // CONFIG_MOTOR
}
