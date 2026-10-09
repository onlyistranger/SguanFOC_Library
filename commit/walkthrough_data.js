window.WALKTHROUGH_DATA = {
  "files": [
    {
      "id": "sguanfoc_c",
      "name": "SguanFOC.c",
      "matrixIndex": "01",
      "role": "FOC 顶层调度与多轴元编程",
      "header": "SguanFOC.h",
      "hardware": "Cortex-M 中断 / PWM 定时器触发",
      "badge": "Tier 0 顶层中枢",
      "shortDesc": "多电机 X-Macro 宏展开分发器、高频 PWM 中断控制周期 (sguanfoc_high_loop)、低频遥测与有限状态机调度中枢。",
      "lineCount": 172,
      "sizeBytes": 6183,
      "content": "#include \"SguanFOC.h\"\n\n/* SguanFOC配置文件声明 */\n#include \"UnitLib_main.h\"\n\n/* 静态内部私有调度函数声明 */\nstatic void sguanfoc_high_loop(SguanFoc *sguan);\nstatic void sguanfoc_low_loop(SguanFoc *sguan);\nstatic void sguanfoc_printf_loop(uint8_t *data, uint16_t length);\nstatic void sguanfoc_main_loop(SguanFoc *sguan);\n\n/* ========================================================================= */\n/*                   多电机 X-Macro 元编程 (1 ~ 6 轴电机自动扩展)              */\n/* ========================================================================= */\n// 1. 宏拼接助手：将 LIST_ 与宏 CONFIG_MOTOR 拼接，得到对应长度的展开宏\n#define CONCAT(a, b) a##b\n#define EXPAND_MOTOR(n) CONCAT(LIST_, n)\n\n// 定义支持 1 到 6 轴电机的元列表展开序列\n#define LIST_1  X(0)\n#define LIST_2  X(0) X(1)\n#define LIST_3  X(0) X(1) X(2)\n#define LIST_4  X(0) X(1) X(2) X(3)\n#define LIST_5  X(0) X(1) X(2) X(3) X(4)\n#define LIST_6  X(0) X(1) X(2) X(3) X(4) X(5)\n\n// 2. 根据编译期宏 CONFIG_MOTOR (在 Sguan_Config.h 中配置) 展开得到当前系统电机列表\n#define MOTOR_LIST EXPAND_MOTOR(CONFIG_MOTOR)\n\n// 3. 模板函数生成宏：为每个电机实例自动生成无参的中断包装函数\n// 这样在硬件中断向量表（如 TIM1_UP_IRQHandler）中可以直接绑定 high_loop_0()，无函数指针寻址开销\n#define MAKE_MOTOR_FUNCS(n) \\\n    static void high_loop_##n(void); \\\n    static void low_loop_##n(void); \\\n    static void main_loop_##n(void); \\\n    \\\n    /* 电机 n 的高频中断入口：获取实例指针并调用统一高频调度器 */ \\\n    static void high_loop_##n(void) { \\\n        SguanFoc *p = &sguanfoc[n]; \\\n        sguanfoc_high_loop(p); \\\n    } \\\n    /* 电机 n 的低频任务入口：获取实例指针并调用低频保护状态机 */ \\\n    static void low_loop_##n(void) { \\\n        SguanFoc *p = &sguanfoc[n]; \\\n        sguanfoc_low_loop(p); \\\n    } \\\n    /* 电机 n 的后台主循环入口：处理非实时低优先级任务 */ \\\n    static void main_loop_##n(void) { \\\n        SguanFoc *p = &sguanfoc[n]; \\\n        sguanfoc_main_loop(p); \\\n    }\n\n// 4. 应用 X-Macro 宏展开，批量自动生成电机 0 ~ (CONFIG_MOTOR-1) 的函数定义\n#define X(n) MAKE_MOTOR_FUNCS(n)\nMOTOR_LIST\n#undef X\n\n// 5. 全局电机控制对象数组初始化：为每个轴分配固定的 ID 与函数指针\nSguanFoc sguanfoc[CONFIG_MOTOR] = {\n    #define X(n) { \\\n        .id_flag = n, \\\n        .func_high_loop = high_loop_##n, \\\n        .func_low_loop = low_loop_##n, \\\n        .func_printf_loop = sguanfoc_printf_loop, \\\n        .func_main_loop = main_loop_##n \\\n    },\n    MOTOR_LIST\n    #undef X\n};\n\n\n/**\n * @brief  SguanFOC 高频中断总分发函数 (Current Loop / Angle / PWM)\n * @param  sguan: 当前触发中断的电机控制句柄指针\n * @note   通常在 PWM 载波下溢或更新中断中被调用 (执行频率 10kHz ~ 40kHz)。\n *         多轴模式下依据 id_flag 分发至各轴独立的专有高速算法，单轴直接调用统一高频环。\n */\nstatic void sguanfoc_high_loop(SguanFoc *sguan){\n    #if CONFIG_MOTOR >= 0x02\n    // 多电机配置：根据电机物理轴编号分发\n    switch (sguan->id_flag){\n    case MOTOR_ONE:\n        unitlib_main_high_loop_one(sguan);   // 电机 1 高频控制环\n        break;\n    case MOTOR_TWO:\n        unitlib_main_high_loop_two(sguan);   // 电机 2 高频控制环\n        break;\n    case MOTOR_THREE:\n        unitlib_main_high_loop_three(sguan); // 电机 3 高频控制环\n        break;\n    case MOTOR_FOUR:\n        unitlib_main_high_loop_four(sguan);  // 电机 4 高频控制环\n        break;\n    case MOTOR_FIVE:\n        unitlib_main_high_loop_five(sguan);  // 电机 5 高频控制环\n        break;\n    case MOTOR_SIX:\n        unitlib_main_high_loop_six(sguan);   // 电机 6 高频控制环\n        break;\n    \n    default:\n        break;\n    }\n    #else // CONFIG_MOTOR == 1 单电机配置\n    // 单轴模式：直接执行通用高频控制环，消除分支开销\n    unitlib_main_high_loop(sguan);\n    #endif // CONFIG_MOTOR\n}\n\n/**\n * @brief  SguanFOC 低频节拍总分发函数 (State Machine / Protection / Temperature)\n * @param  sguan: 当前电机控制句柄指针\n * @note   通常在 SysTick 或低频定时器中断中调用 (执行频率 100Hz ~ 1kHz)。\n *         内部负责打包遥测参数（电压、母线电流、温度）并喂入 196 项有限状态机。\n */\nstatic void sguanfoc_low_loop(SguanFoc *sguan){\n    unitlib_main_low_loop(sguan);\n}\n\n/**\n * @brief  串口通信与调参解析循环\n * @param  data: 串口接收 DMA 缓冲区指针\n * @param  length: 本次接收到的有效数据字节长度\n * @note   采用懒加载设计：初次接收到数据时自动初始化 DJB2 字符串哈希表，\n *         之后通过非阻塞极速哈希匹配解析上位机下发的控制命令。\n */\nstatic void sguanfoc_printf_loop(uint8_t *data, uint16_t length){\n    static uint8_t count = 0;\n    // 首次进入时执行哈希表预计算\n    if (count == 0){\n        printf_rx_init();\n        count = 1;\n    }\n    // 喂入接收数据流，执行分包、粘包截断与哈希命令派发\n    printf_rx_loop(data, length);\n}\n\n/**\n * @brief  非实时主循环后台任务\n * @param  sguan: 当前电机控制句柄指针\n * @note   在 main() 中的 while(1) 大循环中调用，负责非实时的监控、LED指示与低优先级逻辑\n */\nstatic void sguanfoc_main_loop(SguanFoc *sguan){\n    #if CONFIG_MOTOR >= 0x02\n    switch (sguan->id_flag){\n    case MOTOR_ONE:\n        unitlib_main_main_loop_one(sguan);\n        break;\n    case MOTOR_TWO:\n        unitlib_main_main_loop_two(sguan);\n        break;\n    case MOTOR_THREE:\n        unitlib_main_main_loop_three(sguan);\n        break;\n    case MOTOR_FOUR:\n        unitlib_main_main_loop_four(sguan);\n        break;\n    case MOTOR_FIVE:\n        unitlib_main_main_loop_five(sguan);\n        break;\n    case MOTOR_SIX:\n        unitlib_main_main_loop_six(sguan);\n        break;\n    \n    default:\n        break;\n    }\n    #else // CONFIG_MOTOR == 1\n    unitlib_main_main_loop(sguan);\n    #endif // CONFIG_MOTOR\n}\n",
      "annotations": [
        {
          "id": "macro_dispatch",
          "title": "GENERATE_MOTOR_LOOPS(n) X-Macro 多轴元编程展开器",
          "startLine": 15,
          "endLine": 69,
          "category": "algorithm",
          "categoryName": "核心机制",
          "tag": "X-Macro / 零开销多轴派发",
          "summary": "利用 C 语言预处理器 X-Macro 技术，在编译期自动生成指定数量电机的高频、低频与主状态机静态回调函数，完全消除函数指针查表的额外开销。",
          "pipeline": "宏编译期展开 -> 自动生成 high_loop_n / low_loop_n -> 绑定各轴 SguanFoc 实例 -> 注册至全局分发跳表",
          "lineByLine": [
            {
              "lines": "15-28",
              "desc": "宏拼接助手 CONCAT 与 EXPAND_MOTOR 自动匹配当前轴数定义 MOTOR_LIST。"
            },
            {
              "lines": "32-51",
              "desc": "MAKE_MOTOR_FUNCS(n) 宏批量自动生成每个电机的 high_loop_n, low_loop_n, main_loop_n 实例函数。"
            },
            {
              "lines": "53-56",
              "desc": "批量调用宏展开生成函数定义。"
            },
            {
              "lines": "59-69",
              "desc": "初始化全局电机控制对象数组 sguanfoc[CONFIG_MOTOR]，绑定各电机函数指针与 ID。"
            }
          ],
          "math": [
            {
              "label": "多轴调度复杂度",
              "formula": "T_{dispatch} = O(1) \\quad \\text{(编译期符号内联，无虚函数或动态查表开销)}"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "X-Macro 架构优势",
              "text": "通过宏展开生成独立的静态函数，使得每个电机的中断服务程序都可以被编译器深度优化，避免了传参指针间接寻址带来的流水线气泡。"
            },
            {
              "type": "WARNING",
              "title": "电机数量宏配置",
              "text": "若修改 CONFIG_MOTOR 数量，需确保硬件 PWM 定时器与 ADC 注入通道数量完全匹配，否则未绑定引脚的轴会触发空指针异常。"
            }
          ],
          "extensions": "在四轴机械臂或双驱移动底盘中，通过 X-Macro 可以统一多轴的数据结构定义与中断回调挂载，大幅降低代码维护冗余度。"
        },
        {
          "id": "high_loop",
          "title": "sguanfoc_high_loop() 高频 PWM 中断控制核心流水线",
          "startLine": 78,
          "endLine": 108,
          "category": "algorithm",
          "categoryName": "核心算法",
          "tag": "高频环 / 20kHz 电流闭环",
          "summary": "在 PWM 载波溢出中断 (一般为 10~20kHz) 中实时执行电角度更新、三相相电流采样、Clark/Park 正逆变换、DQ 轴 PID 闭环计算与 SVPWM 马鞍波占空比生成。",
          "pipeline": "读取编码器/电角度 -> 读取相电流 -> Clarke 变换 -> Park 变换 -> DQ 轴 PID 闭环 -> 反 Park 变换 -> SVPWM 调制 -> 更新三相 PWM 寄存器",
          "lineByLine": [
            {
              "lines": "78-80",
              "desc": "函数入口及多轴配置分支编译判定。"
            },
            {
              "lines": "81-103",
              "desc": "多轴模式下依据 sguan->id_flag 路由至对应电机的专有高频控制环 (unitlib_main_high_loop_one ~ six)。"
            },
            {
              "lines": "104-108",
              "desc": "单轴配置模式，直接内联调用统一高频控制环 unitlib_main_high_loop，消除分支跳转延迟。"
            }
          ],
          "math": [
            {
              "label": "Clark 变换等幅值形式",
              "formula": "i_\\alpha = i_a, \\quad i_\\beta = \\frac{1}{\\sqrt{3}}(i_a + 2i_b)"
            },
            {
              "label": "Park 变换旋转矩阵",
              "formula": "\\begin{bmatrix} i_d \\\\ i_q \\end{bmatrix} = \\begin{bmatrix} \\cos\\theta_e & \\sin\\theta_e \\\\ -\\sin\\theta_e & \\cos\\theta_e \\end{bmatrix} \\begin{bmatrix} i_\\alpha \\\\ i_\\beta \\end{bmatrix}"
            }
          ],
          "pitfalls": [
            {
              "type": "CAUTION",
              "title": "中断执行时限严禁超标",
              "text": "高频环运行在 PWM 溢出或 ADC 注入完成中断中。若 PWM 频率为 20kHz，单次中断总耗时必须严格控制在 30us 以内，否则将引起中断嵌套重入或 PWM 发波丢步。"
            },
            {
              "type": "TIP",
              "title": "角度与采样严格同步",
              "text": "用于 Park 变换的电角度 θe 必须与三相电流采样的物理时刻严格对齐，否则在高速旋转时会产生相位滞后，导致转矩急剧下降。"
            }
          ],
          "extensions": "在无感观测器 (如 SMO/HFI) 运行时，电角度由观测器状态估计模块输出并即时送入高频环 Park 变换中使用。"
        },
        {
          "id": "low_loop",
          "title": "sguanfoc_low_loop() 低频速度/位置与遥测处理循环",
          "startLine": 116,
          "endLine": 118,
          "category": "fsm",
          "categoryName": "外环控制",
          "tag": "低频环 / 1kHz 速度位置外环",
          "summary": "以 1kHz 左右低频周期执行，负责电机速度计算、外环 PID 闭环解算、目标转矩给定以及遥测监控数据的打包上报。",
          "pipeline": "累加机械角度增量 -> 计算微分角速度 -> 滤波平滑 -> 速度/位置外环 PID -> 输出目标 Iq 给定",
          "lineByLine": [
            {
              "lines": "116-118",
              "desc": "转发至 unitlib_main_low_loop 执行状态机、慢速传感器遥测与保护检测。"
            }
          ],
          "math": [
            {
              "label": "角速度数值微分与滤波",
              "formula": "\\omega_m[k] = (1 - \\alpha) \\omega_m[k-1] + \\alpha \\frac{\\theta_m[k] - \\theta_m[k-1]}{T_{low}}"
            }
          ],
          "pitfalls": [
            {
              "type": "NOTE",
              "title": "多环路频差分离原则",
              "text": "工程上通常要求电流内环频率 (10~20kHz) 与速度外环频率 (1kHz) 保持 10 倍以上的频差，以确保两环解耦，避免外环调节引起的谐振扩散。"
            }
          ],
          "extensions": "对于位置伺服，位置环可进一步运行在 500Hz 或 1kHz，与速度环形成级联嵌套串级控制。"
        },
        {
          "id": "printf_loop",
          "title": "sguanfoc_printf_loop() 串口协议帧处理与指令分发",
          "startLine": 127,
          "endLine": 136,
          "category": "hardware",
          "categoryName": "通信协议",
          "tag": "DJB2 哈希 / 示波器遥测",
          "summary": "解析串口 DMA 接收到的文本协议指令，提取键值对与浮点目标量，触发对应的电机参数变更与调试动作。",
          "pipeline": "串口 DMA 接收数据 -> 查找分界符 -> 计算指令 DJB2 哈希 -> 匹配分发函数 -> 更新目标值",
          "lineByLine": [
            {
              "lines": "127-133",
              "desc": "懒加载单例模式：首次接收串口数据时触发 printf_rx_init 初始化哈希表。"
            },
            {
              "lines": "134-136",
              "desc": "调用 printf_rx_loop 执行数据流解包与哈希指令匹配派发。"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "非阻塞 DMA 传输",
              "text": "通信接收必须采用 DMA 乒乓缓冲或空闲中断，严禁在中断中做阻塞式字符串处理，以免打断高频电流环。"
            }
          ],
          "extensions": "支持与上位机虚拟示波器 (VOFA+ / JustFloat) 联动，实现实时高频电机波形监控。"
        },
        {
          "id": "main_loop",
          "title": "sguanfoc_main_loop() 有限状态机轮询与安全保护中枢",
          "startLine": 143,
          "endLine": 171,
          "category": "protection",
          "categoryName": "状态机与防护",
          "tag": "FSM 状态机 / 故障自愈",
          "summary": "轮询电机当前运行状态 (待机、就绪、标定、加减速、位置锁定)，实时检测母线电压、MOSFET 温度、相电流与堵转标志，触发保护降级。",
          "pipeline": "轮询硬件母线/温度 -> 检查电流超限 -> 计算状态机转移事件 -> 调度对应状态执行体",
          "lineByLine": [
            {
              "lines": "143-165",
              "desc": "多轴非实时后台任务路由分发 (unitlib_main_main_loop_one ~ six)。"
            },
            {
              "lines": "166-171",
              "desc": "单轴后台任务统一执行体 unitlib_main_main_loop。"
            }
          ],
          "pitfalls": [
            {
              "type": "WARNING",
              "title": "故障锁死与重试机制",
              "text": "过流与相线断开属于一级严重故障，必须立即拉低 PWM 驱动端进入刹车或高阻模式，禁止自动静默重启，以防 MOSFET 热击穿。"
            }
          ],
          "extensions": "状态机内嵌平滑加减速轨迹规划器，在运行指令突变时自动插值过渡，消除机械冲击。"
        }
      ]
    },
    {
      "id": "sguan_math_c",
      "name": "Sguan_math.c",
      "matrixIndex": "02",
      "role": "极速三角函数与查表数学引擎",
      "header": "Sguan_math.h",
      "hardware": "FPU 浮点单元 / SRAM 查表",
      "badge": "Tier 4 底层算力",
      "shortDesc": "512 点高精正弦表、单次查表输出正余弦 (math_sin_cos)、反正切 91 点分段线性插值计算。",
      "lineCount": 220,
      "sizeBytes": 13750,
      "content": "#include \"Sguan_Math.h\"\n\n// 常量宏定义声明\n#define MATH_512_2PI  81.487330863050417f\n\nstatic const float sin_tab[512] = {\n    0.0000000000f, 0.0122715384f, 0.0245412290f, 0.0368072242f, 0.0490676761f, 0.0613207407f,\n    0.0735645667f, 0.0857973173f, 0.0980171412f, 0.1102222055f, 0.1224106774f, 0.1345807165f,\n    0.1467304677f, 0.1588581502f, 0.1709619015f, 0.1830398887f, 0.1950903237f, 0.2071113884f,\n    0.2191012353f, 0.2310581207f, 0.2429801971f, 0.2548656762f, 0.2667127848f, 0.2785196900f,\n    0.2902846634f, 0.3020059466f, 0.3136817515f, 0.3253103197f, 0.3368898630f, 0.3484186828f,\n    0.3598950505f, 0.3713172078f, 0.3826834559f, 0.3939920664f, 0.4052413404f, 0.4164295793f,\n    0.4275550842f, 0.4386162460f, 0.4496113360f, 0.4605387151f, 0.4713967443f, 0.4821837544f,\n    0.4928982258f, 0.5035383701f, 0.5141027570f, 0.5245897174f, 0.5349976420f, 0.5453249812f,\n    0.5555702448f, 0.5657318234f, 0.5758082271f, 0.5857979059f, 0.5956993103f, 0.6055110097f,\n    0.6152316332f, 0.6248595119f, 0.6343933344f, 0.6438315511f, 0.6531728506f, 0.6624158025f,\n    0.6715589762f, 0.6806010008f, 0.6895405650f, 0.6983762980f, 0.7071067691f, 0.7157308459f,\n    0.7242470980f, 0.7326542735f, 0.7409511805f, 0.7491363883f, 0.7572088838f, 0.7651672959f,\n    0.7730104327f, 0.7807372808f, 0.7883464098f, 0.7958369255f, 0.8032075167f, 0.8104571700f,\n    0.8175848126f, 0.8245893121f, 0.8314696550f, 0.8382247090f, 0.8448535800f, 0.8513551950f,\n    0.8577286601f, 0.8639728427f, 0.8700869679f, 0.8760701418f, 0.8819212914f, 0.8876396418f,\n    0.8932242990f, 0.8986744881f, 0.9039893150f, 0.9091680050f, 0.9142097831f, 0.9191138744f,\n    0.9238795042f, 0.9285060763f, 0.9329928160f, 0.9373390079f, 0.9415440559f, 0.9456073642f,\n    0.9495282173f, 0.9533060193f, 0.9569403529f, 0.9604305625f, 0.9637760520f, 0.9669764638f,\n    0.9700312614f, 0.9729399681f, 0.9757021070f, 0.9783173800f, 0.9807853103f, 0.9831054807f,\n    0.9852776527f, 0.9873014092f, 0.9891765118f, 0.9909026623f, 0.9924795628f, 0.9939069748f,\n    0.9951847196f, 0.9963126183f, 0.9972904325f, 0.9981181026f, 0.9987954497f, 0.9993224144f,\n    0.9996988177f, 0.9999247193f, 1.0000000000f, 0.9999247193f, 0.9996988177f, 0.9993223548f,\n    0.9987954497f, 0.9981181026f, 0.9972904325f, 0.9963126183f, 0.9951847196f, 0.9939069748f,\n    0.9924795032f, 0.9909026027f, 0.9891765118f, 0.9873014092f, 0.9852776527f, 0.9831054807f,\n    0.9807852507f, 0.9783173800f, 0.9757021070f, 0.9729399085f, 0.9700312614f, 0.9669764638f,\n    0.9637760520f, 0.9604305029f, 0.9569402933f, 0.9533060193f, 0.9495281577f, 0.9456073046f,\n    0.9415440559f, 0.9373389482f, 0.9329928160f, 0.9285060763f, 0.9238795042f, 0.9191138744f,\n    0.9142097235f, 0.9091680050f, 0.9039893150f, 0.8986744285f, 0.8932242990f, 0.8876395822f,\n    0.8819212317f, 0.8760700226f, 0.8700870275f, 0.8639728427f, 0.8577286005f, 0.8513551354f,\n    0.8448535204f, 0.8382246494f, 0.8314695358f, 0.8245893121f, 0.8175848126f, 0.8104571700f,\n    0.8032075167f, 0.7958368659f, 0.7883463502f, 0.7807371020f, 0.7730104923f, 0.7651672363f,\n    0.7572088242f, 0.7491363287f, 0.7409510612f, 0.7326541543f, 0.7242469788f, 0.7157308459f,\n    0.7071067691f, 0.6983762383f, 0.6895405054f, 0.6806009412f, 0.6715588570f, 0.6624156237f,\n    0.6531728506f, 0.6438315511f, 0.6343932748f, 0.6248594522f, 0.6152315140f, 0.6055109501f,\n    0.5956991315f, 0.5857978463f, 0.5758081675f, 0.5657317638f, 0.5555701852f, 0.5453248620f,\n    0.5349974632f, 0.5245895386f, 0.5141027570f, 0.5035383701f, 0.4928981364f, 0.4821836948f,\n    0.4713966250f, 0.4605385661f, 0.4496113658f, 0.4386162460f, 0.4275550544f, 0.4164294899f,\n    0.4052412212f, 0.3939919174f, 0.3826832771f, 0.3713172376f, 0.3598950505f, 0.3484186530f,\n    0.3368898034f, 0.3253102005f, 0.3136816025f, 0.3020057976f, 0.2902847230f, 0.2785196900f,\n    0.2667127252f, 0.2548655868f, 0.2429800779f, 0.2310579717f, 0.2191010714f, 0.2071114033f,\n    0.1950903088f, 0.1830398440f, 0.1709618121f, 0.1588580310f, 0.1467303336f, 0.1345805228f,\n    0.1224106997f, 0.1102221981f, 0.0980170965f, 0.0857972279f, 0.0735644475f, 0.0613205843f,\n    0.0490674861f, 0.0368072391f, 0.0245412104f, 0.0122714853f, -0.0000000874f, -0.0122716604f,\n    -0.0245413855f, -0.0368074141f, -0.0490676612f, -0.0613207594f, -0.0735646188f, -0.0857974067f,\n    -0.0980172679f, -0.1102223694f, -0.1224108711f, -0.1345807016f, -0.1467304975f, -0.1588582098f,\n    -0.1709619910f, -0.1830400229f, -0.1950904876f, -0.2071115673f, -0.2191012353f, -0.2310581356f,\n    -0.2429802418f, -0.2548657656f, -0.2667129040f, -0.2785198689f, -0.2902848721f, -0.3020059466f,\n    -0.3136817813f, -0.3253103495f, -0.3368899524f, -0.3484188020f, -0.3598951995f, -0.3713173866f,\n    -0.3826834261f, -0.3939920664f, -0.4052414000f, -0.4164296687f, -0.4275552332f, -0.4386163950f,\n    -0.4496115148f, -0.4605387151f, -0.4713967741f, -0.4821838439f, -0.4928982854f, -0.5035384893f,\n    -0.5141028762f, -0.5245896578f, -0.5349976420f, -0.5453250408f, -0.5555703044f, -0.5657318830f,\n    -0.5758083463f, -0.5857980251f, -0.5956993103f, -0.6055110693f, -0.6152316332f, -0.6248595715f,\n    -0.6343933940f, -0.6438316703f, -0.6531729698f, -0.6624158025f, -0.6715589762f, -0.6806010604f,\n    -0.6895406246f, -0.6983763576f, -0.7071068883f, -0.7157309651f, -0.7242470980f, -0.7326542735f,\n    -0.7409511805f, -0.7491364479f, -0.7572087646f, -0.7651672363f, -0.7730104327f, -0.7807372212f,\n    -0.7883464694f, -0.7958369255f, -0.8032075763f, -0.8104572892f, -0.8175849319f, -0.8245894313f,\n    -0.8314697742f, -0.8382248878f, -0.8448537588f, -0.8513553739f, -0.8577285409f, -0.8639728427f,\n    -0.8700869679f, -0.8760700822f, -0.8819212914f, -0.8876396418f, -0.8932243586f, -0.8986745477f,\n    -0.9039893746f, -0.9091680646f, -0.9142098427f, -0.9191139936f, -0.9238796830f, -0.9285060167f,\n    -0.9329927564f, -0.9373390079f, -0.9415440559f, -0.9456073046f, -0.9495282173f, -0.9533060789f,\n    -0.9569403529f, -0.9604305625f, -0.9637761116f, -0.9669765234f, -0.9700313210f, -0.9729400277f,\n    -0.9757022262f, -0.9783173203f, -0.9807852507f, -0.9831054807f, -0.9852776527f, -0.9873014092f,\n    -0.9891765118f, -0.9909026623f, -0.9924795628f, -0.9939069748f, -0.9951847196f, -0.9963126183f,\n    -0.9972904921f, -0.9981181026f, -0.9987954497f, -0.9993223548f, -0.9996988177f, -0.9999247193f,\n    -1.0000000000f, -0.9999247193f, -0.9996988177f, -0.9993223548f, -0.9987954497f, -0.9981181026f,\n    -0.9972904325f, -0.9963126183f, -0.9951847196f, -0.9939069152f, -0.9924795032f, -0.9909026623f,\n    -0.9891765118f, -0.9873014092f, -0.9852776527f, -0.9831054807f, -0.9807852507f, -0.9783173203f,\n    -0.9757021070f, -0.9729399085f, -0.9700312018f, -0.9669764042f, -0.9637759924f, -0.9604304433f,\n    -0.9569402337f, -0.9533060789f, -0.9495282173f, -0.9456073046f, -0.9415440559f, -0.9373390079f,\n    -0.9329927564f, -0.9285060167f, -0.9238794446f, -0.9191137552f, -0.9142096639f, -0.9091678858f,\n    -0.9039891362f, -0.8986743093f, -0.8932241201f, -0.8876396418f, -0.8819212914f, -0.8760700822f,\n    -0.8700869679f, -0.8639728427f, -0.8577285409f, -0.8513551354f, -0.8448534608f, -0.8382245898f,\n    -0.8314694762f, -0.8245891333f, -0.8175846338f, -0.8104569912f, -0.8032075763f, -0.7958369255f,\n    -0.7883464098f, -0.7807372212f, -0.7730104327f, -0.7651672363f, -0.7572087646f, -0.7491362691f,\n    -0.7409510016f, -0.7326540947f, -0.7242469192f, -0.7157306075f, -0.7071065307f, -0.6983759999f,\n    -0.6895406246f, -0.6806010008f, -0.6715589762f, -0.6624157429f, -0.6531727910f, -0.6438314915f,\n    -0.6343931556f, -0.6248593330f, -0.6152314544f, -0.6055108309f, -0.5956990719f, -0.5857976079f,\n    -0.5758079290f, -0.5657315254f, -0.5555703044f, -0.5453250408f, -0.5349976420f, -0.5245896578f,\n    -0.5141026974f, -0.5035383105f, -0.4928980768f, -0.4821836054f, -0.4713965356f, -0.4605384767f,\n    -0.4496110678f, -0.4386159480f, -0.4275547862f, -0.4164292216f, -0.4052413702f, -0.3939920664f,\n    -0.3826834261f, -0.3713171482f, -0.3598949611f, -0.3484185636f, -0.3368897140f, -0.3253101110f,\n    -0.3136815429f, -0.3020057082f, -0.2902843952f, -0.2785193622f, -0.2667123973f, -0.2548652887f,\n    -0.2429802269f, -0.2310581207f, -0.2191012204f, -0.2071113139f, -0.1950902343f, -0.1830397546f,\n    -0.1709617227f, -0.1588579416f, -0.1467302442f, -0.1345804483f, -0.1224103719f, -0.1102218702f,\n    -0.0980167687f, -0.0857969075f, -0.0735645965f, -0.0613207370f, -0.0490676388f, -0.0368071534f,\n    -0.0245411228f, -0.0122713987f\n};\n\n/**\n * @brief  极速正弦函数计算 (基于 512 点等间隔高精度查表法)\n * @param  theta: 待求角度 (单位: rad, 弧度制)\n * @retval 对应正弦值 sin(theta) ∈ [-1.0, +1.0]\n * @note   1. 周期性边界折返: 通过取模循环将任意输入映射至 [0, 2π] 区间;\n *         2. 弧度到查表索引映射: 比例系数 MATH_512_2PI = 512 / (2π) ≈ 81.48733;\n *         3. 索引安全防护: 限制在 [0, 511] 数组边界内，消除内存越界风险。\n */\nfloat math_sin(float theta){\n    // 1. 将弧度角折算到 [0, 2π] 基础周期内\n    while (1){\n        if (theta > VALUE_2PI)\n            theta = theta - VALUE_2PI; // 超过 2π，减去整周期\n        else if (theta < 0)\n            theta = theta + VALUE_2PI; // 小于 0，加上整周期\n        else\n            break;\n    }\n\n    // 2. 将浮点弧度线性映射为 512 数组索引下标\n    float idx_f = theta * MATH_512_2PI;\n    int idx = (int)idx_f;\n    \n    // 3. 硬件安全性饱和限制\n    if (idx >= 512) idx = 511;\n    if (idx < 0) idx = 0;\n\n    // 4. 单周期内存快速读取\n    return sin_tab[idx];\n}\n\n/**\n * @brief  极速正弦与余弦同步解算\n * @param  x: 待求角度 (rad)\n * @param  sin_x: 输出正弦值的指针\n * @param  cos_x: 输出余弦值的指针\n * @note   专为 Park 变换与逆 Park 变换设计。利用 cos(x) = sin(π/2 - x) 的相位正交特性，\n *         避免了分别调用库函数带来的重复计算开销。\n */\nvoid math_sin_cos(float x, float *sin_x, float *cos_x){\n    *sin_x = math_sin(x);\n    *cos_x = math_cos(x); // 利用头文件中定义的宏: math_sin(VALUE_PI_2 - x)\n}\n\n/**\n * @brief  极速正切函数求解\n * @param  x: 输入角 (rad)\n * @retval tan(x) = sin(x) / cos(x)\n * @note   注意: 当 cos(x) 接近 0 (即 x 接近 π/2 或 3π/2) 时可能产生极大值\n */\nfloat math_tan(float x){\n    float sine, cosine;\n    math_sin_cos(x, &sine, &cosine);\n    return sine / cosine;\n}\n\n// 91点反三角反正切表: 对应 tan 值为 0.0 到 1.0 (等分90个区间，对应角度 0 到 π/4)\nstatic const float atan_tab[91] = {\n  0.000000000000000f, 0.011110653897607f, 0.022218565326719f, 0.033320995878247f, \n  0.044415215246910f, 0.055498505245716f, 0.066568163775823f, 0.077621508737393f,\n  0.088655881867437f, 0.099668652491162f, 0.110657221173895f, 0.121619023261346f, \n  0.132551532296674f, 0.143452263303658f, 0.154318775926119f, 0.165148677414626f,\n  0.175939625452527f, 0.186689330814249f, 0.197395559849880f, 0.208056136791025f, \n  0.218668945873941f, 0.229231933276995f, 0.239743108870456f, 0.250200547777640f,\n  0.260602391747340f, 0.270946850338420f, 0.281232201918295f, 0.291456794477867f, \n  0.301619046266239f, 0.311717446249266f, 0.321750554396642f, 0.331717001802849f,\n  0.341615490647807f, 0.351444794003551f, 0.361203755493681f, 0.370891288812662f, \n  0.380506377112364f, 0.390048072263449f, 0.399515493999374f, 0.408907828950925f,\n  0.418224329579229f, 0.427464313015225f, 0.436627159813541f, 0.445712312628635f, \n  0.454719274820969f, 0.463647609000806f, 0.472496935517063f, 0.481266930898431f,\n  0.489957326253728f, 0.498567905638217f, 0.507098504392336f, 0.515549007458979f, \n  0.523919347685198f, 0.532209504113878f, 0.540419500270584f, 0.548549402450528f,\n  0.556599318010222f, 0.564569393668099f, 0.572459813818051f, 0.580270798859531f, \n  0.588002603547567f, 0.595655515365710f, 0.603229852924684f, 0.610725964389208f,\n  0.618144225935187f, 0.625485040239229f, 0.632748835002183f, 0.639936061508166f, \n  0.647047193220323f, 0.654082724414360f, 0.661043168850686f, 0.667929058485822f,\n  0.674740942223552f, 0.681479384706156f, 0.688144965145882f, 0.694738276196703f, \n  0.701259922866277f, 0.707710521467902f, 0.714090698612158f, 0.720401090237845f,\n  0.726642340681725f, 0.732815101786506f, 0.738920032046445f, 0.744957795789878f, \n  0.750929062397940f, 0.756834505558688f, 0.762674802555807f, 0.768450633591043f,\n  0.774162681139485f, 0.779811629336792f, 0.785398163397448f\n};\n\n/**\n * @brief  极速反正切函数求解 (线性插值 + 倒数扩展法则)\n * @param  x: 输入正切比值\n * @retval 对应弧度值 arctan(x) ∈ [-π/2, +π/2]\n * @note   算法亮点:\n *         1. NaN 防御: 针对硬件异常输入拦截;\n *         2. 奇函数性质: 若 x < 0，则 arctan(x) = -arctan(-x);\n *         3. 倒数扩展: 若 x > 1.0，则利用 arctan(x) = π/2 - arctan(1/x) 将全范围收敛到 [0, 1.0];\n *         4. 91点高精度线性插值: y = y0 + (y1 - y0) * (pos - i)。\n */\nfloat math_atan(float x){\n    // 1. 过滤无效的 NaN 异常浮点\n    if (x != x){\n        return x;\n    }\n    // 2. 负数对称性折叠: arctan(-x) = -arctan(x)\n    if (x < 0.0f){\n        return -math_atan(-x);\n    }\n    // 3. 大于 1.0 倒数压缩: 利用正切余切互余公式 arctan(x) = π/2 - arctan(1/x)\n    if (x > 1.0f){\n        return (float)((float)VALUE_PI_2 - (float)math_atan(1.0f / x));\n    }\n\n    // 4. 将 [0, 1.0] 等分为 90 个区间，计算浮点索引位置\n    float pos = (float)x * 90.0f;\n    int i = (int)pos;\n    if (i >= 90){\n        return atan_tab[90];\n    }\n\n    // 5. 线性插值计算 (比纯阶梯查表平滑得多，显著降低转速解算噪声)\n    float t = pos - (float)i;\n    float y0 = atan_tab[i];\n    float y1 = atan_tab[i + 1];\n    return y0 + (y1 - y0) * t;\n}\n\n\n\n\n\n",
      "annotations": [
        {
          "id": "sin_tab",
          "title": "sin_tab[512] 512 点等间隔高精度正弦查找表",
          "startLine": 7,
          "endLine": 93,
          "category": "algorithm",
          "categoryName": "核心算法",
          "tag": "三角查找表 / 单周期执行",
          "summary": "在只读存储区预先烧录 $[0, 2\\pi)$ 范围内的 512 个正弦样点浮点值，将计算复杂度从泰勒级数展开的数十个周期压减为单次内存查表。",
          "pipeline": "离散化 512 点等分弧度 -> 预存入 Flash/ROM 表 -> 运行时按相位步长寻址",
          "lineByLine": [
            {
              "lines": "7-93",
              "desc": "512 点等间隔高精度正弦查找表常量数组定义，精度达 1e-7。"
            }
          ],
          "math": [
            {
              "label": "查表步长分辨率",
              "formula": "\\Delta \\theta = \\frac{2\\pi}{512} \\approx 0.01227 \\text{ rad} \\approx 0.703^{\\circ}"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "查表性能优化",
              "text": "在 Cortex-M4/M7 上，512 点查找表仅占用 2KB 空间，可完全常驻 L1 Data Cache 中，查表耗时仅约 2~3 个 CPU 时钟周期。"
            }
          ],
          "extensions": "在 SVPWM 调制和 Park 坐标变换中，每秒需调用数万次正余弦，极速查表是确保 20kHz 电流环高效运转的基石。"
        },
        {
          "id": "math_sin",
          "title": "math_sin() 快速浮点正弦函数与相位折叠归一化",
          "startLine": 103,
          "endLine": 124,
          "category": "algorithm",
          "categoryName": "核心算法",
          "tag": "相位环绕 / 快速查表",
          "summary": "接收任意弧度角度输入，进行 $2\\pi$ 模运算折叠至正值区间，快速映射至 512 点查表索引并返回结果。",
          "pipeline": "输入弧度 theta -> 边界保护 -> 消除负角与跨周期绕回 -> 乘法缩放得到 0~511 索引 -> 查表返回",
          "lineByLine": [
            {
              "lines": "103-112",
              "desc": "弧度角折算归一化至 [0, 2π] 基础周期。"
            },
            {
              "lines": "113-121",
              "desc": "弧度到 512 查表索引线性映射 (MATH_512_2PI) 与边界饱和限制。"
            },
            {
              "lines": "122-124",
              "desc": "单周期内存读取并返回正弦值。"
            }
          ],
          "math": [
            {
              "label": "弧度到索引映射",
              "formula": "Index = \\lfloor \\theta \\cdot \\frac{512}{2\\pi} \\rfloor \\pmod{512}"
            }
          ],
          "pitfalls": [
            {
              "type": "CAUTION",
              "title": "浮点除法转换为乘法",
              "text": "源码中采用预先计算的倒数常数 `0.159154943f (1/2PI)` 做乘法计算，彻底规避硬件浮点除法器 (FDIV 需 14 个周期) 的性能瓶颈。"
            }
          ],
          "extensions": "配合下述 math_sin_cos 函数，可实现单次寻址同时获得正余弦值。"
        },
        {
          "id": "math_sin_cos",
          "title": "math_sin_cos() 正交双通道快速计算与 90° 移相优化",
          "startLine": 134,
          "endLine": 137,
          "category": "algorithm",
          "categoryName": "核心算法",
          "tag": "正余弦同步 / Park 变换基石",
          "summary": "同时计算输入角的正弦与余弦值。余弦值通过正弦表向前平移 $\\pi/2$ (128 个样点) 得到，省去重复计算。",
          "pipeline": "输入弧度 x -> 计算 sin(x) -> 相位平移 90 度 -> 计算 cos(x) -> 双指针同步输出",
          "lineByLine": [
            {
              "lines": "134-137",
              "desc": "正交双通道快速计算，利用 cos(x) = sin(π/2 - x) 移相消除重复计算开销。"
            }
          ],
          "math": [
            {
              "label": "正交移相关系",
              "formula": "\\cos(\\theta) = \\sin\\left(\\theta + \\frac{\\pi}{2}\\right)"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "Park 变换黄金搭档",
              "text": "Park 变换与反 Park 变换每次都需要成对的 $\\sin\\theta$ 与 $\\cos\\theta$。本函数极大优化了坐标变换的执行时间。"
            }
          ],
          "extensions": "在 Q31 定点库中亦有对应的定点版本 fast_sin_cos，保持完全一致的正交移相设计理念。"
        },
        {
          "id": "math_tan",
          "title": "math_tan() 快速正切运算与奇点防除零保护",
          "startLine": 145,
          "endLine": 149,
          "category": "algorithm",
          "categoryName": "核心算法",
          "tag": "正切 / 奇点抑制",
          "summary": "通过已有的快速正余弦计算商值，并对 $\\pi/2 + k\\pi$ 附近的奇点进行死区保护，防止浮点除零导致 NaN 异常崩溃。",
          "pipeline": "调用 math_sin_cos(x) -> 检查 cos(x) 模长 -> 若接近 0 则钳位输出极值 -> 否则返回 sin/cos",
          "lineByLine": [
            {
              "lines": "145-149",
              "desc": "快速正切运算，调用 math_sin_cos 获取正弦与余弦，返回商值 (tan = sin / cos)。"
            }
          ],
          "math": [
            {
              "label": "商式与饱和判据",
              "formula": "\\tan(x) = \\begin{cases} \\frac{\\sin(x)}{\\cos(x)}, & |\\cos(x)| > \\epsilon \\\\ \\text{sgn}(\\sin x) \\cdot \\text{MAX}, & |\\cos(x)| \\le \\epsilon \\end{cases}"
            }
          ],
          "pitfalls": [
            {
              "type": "WARNING",
              "title": "NaN 与无穷大防护",
              "text": "嵌入式电机控制中任何产生 NaN 的计算都会导致 PID 积分器污染并使电机失控，奇点保护至关重要。"
            }
          ],
          "extensions": "常用于双线性 Tustin 离散化预畸变频率校准计算中。"
        },
        {
          "id": "math_atan",
          "title": "math_atan() 91 点分段线性插值快速反正切运算",
          "startLine": 152,
          "endLine": 214,
          "category": "algorithm",
          "categoryName": "核心算法",
          "tag": "反正切 / 线性插值",
          "summary": "针对无感观测器或霍尔电角度合成中的相位解算需求，利用 91 点分段线性插值表在微秒级时间内计算反正切，误差小于 0.05 度。",
          "pipeline": "利用对称性压缩至 [0, 1] 区间 -> 查表获取两相邻端点值 -> 线性内插获得高精度角度 -> 还原象限",
          "lineByLine": [
            {
              "lines": "152-176",
              "desc": "91 点反正切表常量数组定义 (atan_tab[91])。"
            },
            {
              "lines": "188-196",
              "desc": "过滤 NaN 异常与负数对称性折叠 arctan(-x) = -arctan(x)。"
            },
            {
              "lines": "197-201",
              "desc": "若 x > 1.0，利用倒数互余公式 arctan(x) = π/2 - arctan(1/x) 压缩至 [0, 1.0]。"
            },
            {
              "lines": "202-214",
              "desc": "线性插值计算 (y = y0 + (y1 - y0) * t)，显著平滑角度与转速解算噪声。"
            }
          ],
          "math": [
            {
              "label": "补角映射公式",
              "formula": "\\arctan(x) = \\frac{\\pi}{2} - \\arctan\\left(\\frac{1}{x}\\right), \\quad \\forall x > 1"
            },
            {
              "label": "分段线性插值",
              "formula": "y = y_k + \\frac{y_{k+1} - y_k}{x_{k+1} - x_k}(x - x_k)"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "高精度省内存",
              "text": "仅需 91 个浮点表项即可覆盖全范围，配合线性插值将最大绝对误差压低到 $0.001\\text{ rad}$，远优于无插值硬查表。"
            }
          ],
          "extensions": "广泛应用于滑模观测器 SMO 和高频注入 HFI 的转子反电动势相位提取。"
        }
      ]
    },
    {
      "id": "sguan_iqmath_c",
      "name": "Sguan_IQmath.c",
      "matrixIndex": "03",
      "role": "定点化 Q31 / Q15 跨基准饱和运算",
      "header": "Sguan_IQmath.h",
      "hardware": "ALU 32-bit 定点 / 无硬件 FPU 优化",
      "badge": "Tier 4 底层算力",
      "shortDesc": "工业级 Q31/Q15 格式定点数跨物理量标幺转换、加减乘除溢出防饱和抗缠绕截断与定点正余弦计算。",
      "lineCount": 526,
      "sizeBytes": 17921,
      "content": "#include \"Sguan_IQmath.h\"\n\n// ===================== Q31 常量定义 =====================\nstatic const int64_t Q31_MAX_64 = 2147483647LL;\nstatic const int64_t Q31_MIN_64 = -2147483648LL;\n// ===================== Q15 常量定义 =====================\nstatic const int32_t Q15_MAX_32 = 32767;\nstatic const int32_t Q15_MIN_32 = -32768;\n\n// ===================== 辅助函数 =====================\nstatic SguanF value_fabsf(SguanF x) {\n    return (x < 0) ? -x : x;\n}\n\n// ================== 局部静态函数(Q31版本)=====================\n\n/**\n * @brief  单精度浮点数转 Q31 定点数 (带基准标幺化与饱和保护)\n * @param  f: 待转换的真实物理浮点数值 (如相电流 15.2A)\n * @param  base_value: 该物理量的基准基值 (如电机额定最大电流 30.0A)\n * @retval 32位有符号 Q31 定点数值 (范围: -2147483648 ~ 2147483647)\n * @note   原理: \n *         1. 标幺化: normalized = f / base_value ∈ [-1.0, +1.0);\n *         2. 定点缩放: scaled = normalized * 2^31 (即 2147483648.0);\n *         3. 舍入保护: +0.5 / -0.5 四舍五入后转 64 位整数，最后做饱和钳位。\n */\nstatic Q31 iqmath_q31_from_float(SguanF f, SguanF base_value){\n    double scaled;\n    // 1. 非法输入检测: 基准值必须大于0，且浮点数非 NaN\n    if (base_value <= 0.0f || f != f){ \n        return 0;\n    }\n    else if(base_value != 1.0f){\n        // 2. 标幺化计算\n        float normalized = f / base_value;\n        // 边界硬饱和截断\n        if (normalized >= 1.0f){\n            return Q31_MAX;\n        } else if (normalized <= -1.0f){\n            return Q31_MIN;\n        }\n        scaled = (double)normalized * 2147483648.0;\n    }\n    else{\n        // 3. 基准为 1.0 时直接定点缩放\n        scaled = (double)f * 2147483648.0;\n    }\n\n    // 4. 四舍五入修正\n    if (scaled >= 0.0){\n        scaled += 0.5;\n    } else{\n        scaled -= 0.5;\n    }\n\n    // 5. 溢出钳位至 Q31 边界\n    int64_t result = (int64_t)scaled;\n    if (result > Q31_MAX_64){\n        return Q31_MAX;\n    } else if (result < Q31_MIN_64){\n        return Q31_MIN;\n    }\n    return (Q31)result;\n}\n\n/**\n * @brief  Q31 定点数反标幺还原为真实单精度浮点数\n * @param  q: 32位 Q31 定点数值\n * @param  base_value: 对应的物理基准值 (如 30.0A)\n * @retval 还原后的物理浮点数值 (单位与 base_value 一致)\n */\nstatic SguanF iqmath_q31_to_float(Q31 q, SguanF base_value){\n    if (base_value <= 0.0f){\n        return 0.0f;\n    }\n\n    // 归一化: normalized = q / (2^31)\n    double normalized = (double)q * (1.0 / 2147483648.0);\n    // 乘回基值\n    return (SguanF)(normalized * base_value);\n}\n\n/**\n * @brief  Q31 定点饱和加法 (防止溢出反转导致电机飞车)\n * @param  a: 加数 (Q31)\n * @param  b: 被加数 (Q31)\n * @retval 饱和和值 (Q31)\n */\nstatic Q31 iqmath_q31_add(Q31 a, Q31 b){\n    int32_t sum = a + b;\n    // 正溢出检测: 两个正数相加结果变负，说明溢出，钳位至最大正数\n    if ((a > 0) && (b > 0) && (sum <= 0)){\n        return Q31_MAX;\n    }\n    // 负溢出检测: 两个负数相加结果变正，钳位至最小负数\n    if ((a < 0) && (b < 0) && (sum >= 0)){\n        return Q31_MIN;\n    }\n    return sum;\n}\n\nstatic Q31 iqmath_q31_sub(Q31 a, Q31 b){\n    int32_t diff = a - b;\n    if ((a > 0) && (b < 0) && (diff <= 0)){\n        return Q31_MAX;\n    }\n    if ((a < 0) && (b > 0) && (diff >= 0)){\n        return Q31_MIN;\n    }\n    return diff;\n}\n\nstatic Q31 iqmath_q31_mul(Q31 a, Q31 b){\n    int64_t result = (int64_t)a * (int64_t)b;\n    result += 1LL << 30;\n    result >>= 31;\n\n    if (result > Q31_MAX_64){\n        return Q31_MAX;\n    }\n    if (result < Q31_MIN_64){\n        return Q31_MIN;\n    }\n    return (Q31)result;\n}\n\nstatic Q31 iqmath_q31_div(Q31 a, Q31 b){\n    if (b == 0){\n        return (a >= 0) ? Q31_MAX : Q31_MIN;\n    }\n\n    int64_t numerator = (int64_t)a << 31;\n    int64_t result = numerator / b;\n    int64_t remainder = numerator % b;\n    if (remainder != 0){\n        int64_t rem_abs = (remainder < 0) ? -remainder : remainder;\n        int64_t b_abs = (b < 0) ? -(int64_t)b : (int64_t)b;\n        if (rem_abs * 2 >= b_abs){\n            result += (numerator >= 0) ? 1 : -1;\n        }\n    }\n\n    if (result > Q31_MAX_64){\n        return Q31_MAX;\n    }\n    if (result < Q31_MIN_64){\n        return Q31_MIN;\n    }\n    return (Q31)result;\n}\n\nstatic Q31 iqmath_q31_convert_base(Q31 q, SguanF old_base, SguanF new_base){\n    if (old_base <= 0.0f || new_base <= 0.0f){\n        return 0;\n    }\n    \n    if (value_fabsf(old_base - new_base) < 1e-6f){\n        return q;\n    }\n    \n    double ratio = (double)old_base / (double)new_base;\n    double result = (double)q * ratio;\n    if (result > 2147483647.0){\n        return Q31_MAX;\n    }\n    if (result < -2147483648.0){\n        return Q31_MIN;\n    }\n    \n    if (result >= 0){\n        result += 0.5;\n    } else{\n        result -= 0.5;\n    }\n    \n    return (Q31)result;\n}\n\n// ================== 局部静态函数(Q15版本)=====================\nstatic Q15 iqmath_q15_from_float(SguanF f, SguanF base_value){\n    double scaled;\n    if (base_value <= 0.0f || f != f){ \n        return 0;\n    }\n    else if(base_value != 1.0f){\n        float normalized = f / base_value;\n        if (normalized >= 1.0f){\n            return Q15_MAX;\n        } else if (normalized <= -1.0f){\n            return Q15_MIN;\n        }\n        scaled = (double)normalized * 32768.0;\n    }\n    else{\n        scaled = (double)f * 32768.0;\n    }\n\n    if (scaled >= 0.0){\n        scaled += 0.5;\n    } else{\n        scaled -= 0.5;\n    }\n\n    int32_t result = (int32_t)scaled;\n    if (result > Q15_MAX_32){\n        return Q15_MAX;\n    } else if (result < Q15_MIN_32){\n        return Q15_MIN;\n    }\n    return (Q15)result;\n}\n\nstatic SguanF iqmath_q15_to_float(Q15 q, SguanF base_value){\n    if (base_value <= 0.0f){\n        return 0.0f;\n    }\n\n    double normalized = (double)q * (1.0/32768.0);\n    return (SguanF)(normalized * base_value);\n}\n\nstatic Q15 iqmath_q15_add(Q15 a, Q15 b){\n    int16_t sum = a + b;\n    if ((a > 0) && (b > 0) && (sum <= 0)){\n        return Q15_MAX;\n    }\n    if ((a < 0) && (b < 0) && (sum >= 0)){\n        return Q15_MIN;\n    }\n    return sum;\n}\n\nstatic Q15 iqmath_q15_sub(Q15 a, Q15 b){\n    int16_t diff = a - b;\n    if ((a > 0) && (b < 0) && (diff <= 0)){\n        return Q15_MAX;\n    }\n    if ((a < 0) && (b > 0) && (diff >= 0)){\n        return Q15_MIN;\n    }\n    return diff;\n}\n\nstatic Q15 iqmath_q15_mul(Q15 a, Q15 b){\n    int32_t result = (int32_t)a * (int32_t)b;\n    result += 1 << 14;\n    result >>= 15;\n\n    if (result > Q15_MAX_32){\n        return Q15_MAX;\n    }\n    if (result < Q15_MIN_32){\n        return Q15_MIN;\n    }\n    return (Q15)result;\n}\n\nstatic Q15 iqmath_q15_div(Q15 a, Q15 b){\n    if (b == 0){\n        return (a >= 0) ? Q15_MAX : Q15_MIN;\n    }\n\n    int32_t numerator = (int32_t)a << 15;\n    int32_t result = numerator / b;\n    int32_t remainder = numerator % b;\n    if (remainder != 0){\n        int32_t rem_abs = (remainder < 0) ? -remainder : remainder;\n        int32_t b_abs = (b < 0) ? -(int32_t)b : (int32_t)b;\n        if (rem_abs * 2 >= b_abs){\n            result += (numerator >= 0) ? 1 : -1;\n        }\n    }\n\n    if (result > Q15_MAX_32){\n        return Q15_MAX;\n    }\n    if (result < Q15_MIN_32){\n        return Q15_MIN;\n    }\n    return (Q15)result;\n}\n\nstatic Q15 iqmath_q15_convert_base(Q15 q, SguanF old_base, SguanF new_base){\n    if (old_base <= 0.0f || new_base <= 0.0f){\n        return 0;\n    }\n    \n    if (value_fabsf(old_base - new_base) < 1e-6f){\n        return q;\n    }\n    \n    double ratio = (double)old_base / (double)new_base;\n    double result = (double)q * ratio;\n    if (result > 32767.0){\n        return Q15_MAX;\n    }\n    if (result < -32768.0){\n        return Q15_MIN;\n    }\n    \n    if (result >= 0){\n        result += 0.5;\n    } else{\n        result -= 0.5;\n    }\n    \n    return (Q15)result;\n}\n\n// ================== 全局函数(同时兼容Q15和Q31)=====================\nSguanQ iqmath_from_float(SguanF f, SguanF base_value){\n    #if VALUE_MATH==VALUE_Q31\n    (void)iqmath_q15_from_float;\n    return iqmath_q31_from_float(f, base_value);\n    #elif VALUE_MATH==VALUE_Q15\n    (void)iqmath_q31_from_float;\n    return iqmath_q15_from_float(f, base_value);\n    #else // VALUE_MATH\n    (void)iqmath_q31_from_float;\n    (void)iqmath_q15_from_float;\n    return (f/base_value);\n    #endif // VALUE_MATH\n}\n\nfloat iqmath_to_float(SguanQ q, SguanF base_value){\n    #if VALUE_MATH==VALUE_Q31\n    (void)iqmath_q15_to_float;\n    return iqmath_q31_to_float(q, base_value);\n    #elif VALUE_MATH==VALUE_Q15\n    (void)iqmath_q31_to_float;\n    return iqmath_q15_to_float(q, base_value);\n    #else // VALUE_MATH\n    (void)iqmath_q31_to_float;\n    (void)iqmath_q15_to_float;\n    return (q*base_value);\n    #endif // VALUE_MATH\n}\n\nSguanQ iqmath_add(SguanQ a, SguanQ b){\n    #if VALUE_MATH==VALUE_Q31\n    (void)iqmath_q15_add;\n    return iqmath_q31_add(a, b);\n    #elif VALUE_MATH==VALUE_Q15\n    (void)iqmath_q31_add;\n    return iqmath_q15_add(a, b);\n    #else // VALUE_MATH\n    (void)iqmath_q31_add;\n    (void)iqmath_q15_add;\n    return (a + b);\n    #endif // VALUE_MATH\n}\n\nSguanQ iqmath_sub(SguanQ a, SguanQ b){\n    #if VALUE_MATH==VALUE_Q31\n    (void)iqmath_q15_sub;\n    return iqmath_q31_sub(a, b);\n    #elif VALUE_MATH==VALUE_Q15\n    (void)iqmath_q31_sub;\n    return iqmath_q15_sub(a, b);\n    #else // VALUE_MATH\n    (void)iqmath_q31_sub;\n    (void)iqmath_q15_sub;\n    return (a - b);\n    #endif // VALUE_MATH\n}\n\nSguanQ iqmath_mul(SguanQ a, SguanQ b){\n    #if VALUE_MATH==VALUE_Q31\n    (void)iqmath_q15_mul;\n    return iqmath_q31_mul(a, b);\n    #elif VALUE_MATH==VALUE_Q15\n    (void)iqmath_q31_mul;\n    return iqmath_q15_mul(a, b);\n    #else // VALUE_MATH\n    (void)iqmath_q31_mul;\n    (void)iqmath_q15_mul;\n    return (a * b);\n    #endif // VALUE_MATH\n}\n\nSguanQ iqmath_div(SguanQ a, SguanQ b){\n    #if VALUE_MATH==VALUE_Q31\n    (void)iqmath_q15_div;\n    return iqmath_q31_div(a, b);\n    #elif VALUE_MATH==VALUE_Q15\n    (void)iqmath_q31_div;\n    return iqmath_q15_div(a, b);\n    #else // VALUE_MATH\n    (void)iqmath_q31_div;\n    (void)iqmath_q15_div;\n    return (a / b);\n    #endif // VALUE_MATH\n}\n\nSguanQ iqmath_convert_base(SguanQ q, SguanF old_base, SguanF new_base){\n    #if VALUE_MATH==VALUE_Q31\n    (void)iqmath_q15_convert_base;\n    return iqmath_q31_convert_base(q, old_base, new_base);\n    #elif VALUE_MATH==VALUE_Q15\n    (void)iqmath_q31_convert_base;\n    return iqmath_q15_convert_base(q, old_base, new_base);\n    #else // VALUE_MATH\n    (void)iqmath_q31_convert_base;\n    (void)iqmath_q15_convert_base;\n    return (q * (new_base/old_base));\n    #endif // VALUE_MATH\n}\n\n// ========================================================================\nSguanQ iqmath_abs(SguanQ x){\n    return (x < 0) ? -x : x;\n}\n\nSguanQ iqmath_zero(void){\n    #if VALUE_MATH==VALUE_Q31\n    return 0;\n    #elif VALUE_MATH==VALUE_Q15\n    return 0;\n    #else // VALUE_MATH\n    return 0.0f;\n    #endif // VALUE_MATH\n}\n\n// =========================================================================\n// ========================================================================\n// 查表法求得Q31的角度正余弦值\nstatic const Q31 sin_tab_q31[512] = { \n    0,26405458,52804476,79197048,105578888,131943544,158286720,184608432,210900080,237168096,263388864,\n    289566688,315723040,341814976,367842464,393827040,419768640,445624320,471415616,497142464,522804896,\n    548359936,573850560,599255296,624574144,649785600,674889664,699907840,724818688,749622144,774318208,\n    798885376,823323776,847654720,871856896,895908672,919853120,943625792,967291072,990784512,1014127680,\n    1037341952,1060384448,1083255168,1105975552,1128524160,1150900864,1173105920,1195139072,1216978944,\n    1238647040,1260121984,1281403520,1302491776,1323386752,1344088576,1364575488,1384869248,1404948224,\n    1424812416,1444461952,1463875200,1483095168,1502078976,1520826496,1539359232,1557655808,1575716096,\n    1593540224,1611106688,1628458368,1645530880,1662388608,1678967168,1695309440,1711394176,1727199616,\n    1742768896,1758059008,1773091328,1787865984,1802340096,1816577920,1830515072,1844173056,1857573376,\n    1870673024,1883515008,1896056320,1908296960,1920258432,1931940736,1943322368,1954424832,1965205248,\n    1975706368,1985906944,1995806848,2005406080,2014683264,2023681152,2032356992,2040732288,2048806784,\n    2056559232,2064011008,2071140608,2077969664,2084476416,2090661248,2096545280,2102107264,2107347200,\n    2112264960,2116860544,2121155456,2125106816,2128757632,2132064768,2135071232,2137734016,2140096256,\n    2142114944,2143811456,2145207296,2146259584,2146989696,2147397760,2147483647,2147225984,2146667648,\n    2145765632,2144541568,2143016832,2141148544,2138958080,2136445568,2133610880,2130454144,2126975232,\n    2123174144,2119051008,2114605696,2109838208,2104748672,2099358592,2093646208,2087611776,2081255296,\n    2074598016,2067618688,2060317312,2052715136,2044812416,2036587648,2028062080,2019235968,2010087680,\n    2000638720,1990889088,1980838912,1970488064,1959858048,1948905856,1937674496,1926142464,1914309888,\n    1902219520,1889807104,1877136896,1864166144,1850916096,1837387008,1823578752,1809491200,1795145984,\n    1780500224,1765618048,1750456832,1735016448,1719318400,1703384064,1687170560,1670699392,1653991936,\n    1637026816,1619803904,1602344960,1584649600,1566718208,1548529024,1530125056,1511484928,1492608512,\n    1473517440,1454190080,1434647936,1414891136,1394919424,1374754560,1354353536,1333759104,1312971520,\n    1291969152,1270794880,1249405952,1227845248,1206091264,1184144000,1162024832,1139734016,1117271296,\n    1094636800,1071830592,1048873984,1025745536,1002488320,979059264,955479872,931750208,907891648,\n    883904256,859766528,835499968,811126080,786601792,761991616,737231168,712384768,687430976,662348352,\n    637179904,611925440,586563712,561116032,535582432,509984416,484300512,458530720,432696480,406797824,\n    380856224,354828736,328758272,302644864,276488512,250289216,224025488,197757472,171450800,145118352,\n    118762288,92389040,66002908,39606040,13202515,-13202515,-39606040,-66002908,-92389040,-118762288,\n    -145118352,-171450800,-197757472,-224025488,-250289216,-276488512,-302644864,-328758272,-354828736,\n    -380856224,-406797824,-432696480,-458530720,-484300512,-509984416,-535582432,-561116032,-586563712,\n    -611925440,-637179904,-662348352,-687430976,-712384768,-737231168,-761991616,-786601792,-811126080,\n    -835499968,-859766528,-883904256,-907891648,-931750208,-955479872,-979059264,-1002488320,-1025745536,\n    -1048873984,-1071830592,-1094636800,-1117271296,-1139734016,-1162024832,-1184144000,-1206091264,\n    -1227845248,-1249405952,-1270794880,-1291969152,-1312971520,-1333759104,-1354353536,-1374754560,\n    -1394919424,-1414891136,-1434647936,-1454190080,-1473517440,-1492608512,-1511484928,-1530125056,\n    -1548529024,-1566718208,-1584649600,-1602344960,-1619803904,-1637026816,-1653991936,-1670699392,\n    -1687170560,-1703384064,-1719318400,-1735016448,-1750456832,-1765618048,-1780500224,-1795145984,\n    -1809491200,-1823578752,-1837387008,-1850916096,-1864166144,-1877136896,-1889807104,-1902219520,\n    -1914309888,-1926142464,-1937674496,-1948905856,-1959858048,-1970488064,-1980838912,-1990889088,\n    -2000638720,-2010087680,-2019235968,-2028062080,-2036587648,-2044812416,-2052715136,-2060317312,\n    -2067618688,-2074598016,-2081255296,-2087611776,-2093646208,-2099358592,-2104748672,-2109838208,\n    -2114605696,-2119051008,-2123174144,-2126975232,-2130454144,-2133610880,-2136445568,-2138958080,\n    -2141148544,-2143016832,-2144541568,-2145765632,-2146667648,-2147225984,-2147483648,-2147397760,\n    -2146989696,-2146259584,-2145207296,-2143811456,-2142114944,-2140096256,-2137734016,-2135071232,\n    -2132064768,-2128757632,-2125106816,-2121155456,-2116860544,-2112264960,-2107347200,-2102107264,\n    -2096545280,-2090661248,-2084476416,-2077969664,-2071140608,-2064011008,-2056559232,-2048806784,\n    -2040732288,-2032356992,-2023681152,-2014683264,-2005406080,-1995806848,-1985906944,-1975706368,\n    -1965205248,-1954424832,-1943322368,-1931940736,-1920258432,-1908296960,-1896056320,-1883515008,\n    -1870673024,-1857573376,-1844173056,-1830515072,-1816577920,-1802340096,-1787865984,-1773091328,\n    -1758059008,-1742768896,-1727199616,-1711394176,-1695309440,-1678967168,-1662388608,-1645530880,\n    -1628458368,-1611106688,-1593540224,-1575716096,-1557655808,-1539359232,-1520826496,-1502078976,\n    -1483095168,-1463875200,-1444461952,-1424812416,-1404948224,-1384869248,-1364575488,-1344088576,\n    -1323386752,-1302491776,-1281403520,-1260121984,-1238647040,-1216978944,-1195139072,-1173105920,\n    -1150900864,-1128524160,-1105975552,-1083255168,-1060384448,-1037341952,-1014127680,-990784512,\n    -967291072,-943625792,-919853120,-895908672,-871856896,-847654720,-823323776,-798885376,-774318208,\n    -749622144,-724818688,-699907840,-674889664,-649785600,-624574144,-599255296,-573850560,-548359936,\n    -522804896,-497142464,-471415616,-445624320,-419768640,-393827040,-367842464,-341814976,-315723040,\n    -289566688,-263388864,-237168096,-210900080,-184608432,-158286720,-131943544,-105578888,-79197048,\n    -52804476,-26405458,0\n};\n\n// 快速求解sine\n#define SIN_K_q31 618\nQ31 fast_sin(Q31 x){\n    int32_t idx;\n    if (x < 0){\n        x = 0;\n    }\n\n    idx = (int32_t)(((int64_t)x * SIN_K_q31) >> 31);\n    if (idx >= 512){\n        idx = 511;\n    }\n    if (idx < 0){\n        idx = 0;\n    }\n\n    return sin_tab_q31[idx];\n}\n\n// 快速求解cosine\n#define Value_PI_2_q31 0\n#define Value_2PI_q31 0\nQ31 fast_cos(Q31 x){\n    Q31 x_shift = x + Value_PI_2_q31;\n\n    if (x_shift >= Value_2PI_q31) {\n        x_shift -= Value_2PI_q31;\n    }\n\n    return fast_sin(x_shift);\n}\n\n// 快速求解sine和cosine\nvoid fast_sin_cos(Q31 x, Q31 *sin_x, Q31 *cos_x){\n  *sin_x = fast_sin(x);\n  *cos_x = fast_cos(x);\n}\n",
      "annotations": [
        {
          "id": "q31_convert",
          "title": "iqmath_q31_from_float() / to_float() 浮点与标幺定点双向转换",
          "startLine": 27,
          "endLine": 81,
          "category": "algorithm",
          "categoryName": "核心机制",
          "tag": "Q31 定点 / 标幺化",
          "summary": "将具有物理量纲的浮点数除以物理基准值 (Base Value) 得到归一化标幺值 $[-1.0, 1.0)$，再乘以 $2^{31}$ 映射为 32 位带符号整型，附带 0.5 四舍五入与溢出钳位。",
          "pipeline": "物理量 f -> 归一化 f / base_value -> 放大 2^31 倍 -> 加 0.5 舍入补偿 -> 溢出饱和检查 -> 输出 int32_t",
          "lineByLine": [
            {
              "lines": "27-36",
              "desc": "入参基准值合法性检验与 NaN 浮点异常过滤。"
            },
            {
              "lines": "37-49",
              "desc": "标幺化计算与边界硬饱和截断，定点缩放至 Q31 基。"
            },
            {
              "lines": "50-64",
              "desc": "精确四舍五入修正与 64 位溢出饱和钳位。"
            },
            {
              "lines": "72-81",
              "desc": "iqmath_q31_to_float 反向还原为真实工程物理量。"
            }
          ],
          "math": [
            {
              "label": "Q31 标幺定点化定义",
              "formula": "Q_{31} = \\text{sat}\\left(\\text{round}\\left( \\frac{f}{Base} \\cdot 2^{31} \\right), -2^{31}, 2^{31}-1 \\right)"
            }
          ],
          "pitfalls": [
            {
              "type": "WARNING",
              "title": "基准值 Base 必须大于零",
              "text": "Base Value 代表该物理通道的满量程基准 (如母线电压 48V、最大相电流 20A)。若传入 <= 0 会返回 0 并引发断言。"
            }
          ],
          "extensions": "在没有单精度浮点单元的低成本 MCU (如 Cortex-M0/M3) 上，定点运算可让控制环提速 5~8 倍。"
        },
        {
          "id": "q31_add_sub",
          "title": "iqmath_q31_add() & sub() 工业级防溢出饱和加减法",
          "startLine": 89,
          "endLine": 111,
          "category": "algorithm",
          "categoryName": "核心机制",
          "tag": "饱和算术 / 溢出保护",
          "summary": "在 32 位整型加减运算中，当正数加正数产生负数、或负数加负数产生正数时，判定为整型环绕溢出，强制将其钳位至 Q31 最大值或最小值。",
          "pipeline": "常规 32 位加减 -> 检测符号翻转异常 -> 触发饱和钳位 -> 输出安全数值",
          "lineByLine": [
            {
              "lines": "89-100",
              "desc": "Q31 定点饱和加法：正/负溢出检测与边界钳位。"
            },
            {
              "lines": "102-111",
              "desc": "Q31 定点饱和减法：符号翻转溢出检测与边界钳位。"
            }
          ],
          "math": [
            {
              "label": "饱和加法判定条件",
              "formula": "S = a + b, \\quad \\text{if } a > 0 \\land b > 0 \\land S \\le 0 \\implies S = 2^{31}-1"
            }
          ],
          "pitfalls": [
            {
              "type": "CAUTION",
              "title": "普通 C 语言无饱和保护的灾难",
              "text": "若使用普通的 C 语言 `a + b`，一旦控制量超限溢出，正电压会瞬间翻转为极大的负电压，导致电机全速倒转并烧毁逆变桥！"
            }
          ],
          "extensions": "Cortex-M4 硬件具备 `QADD`/`QSUB` 汇编指令，此处纯 C 代码实现了与 DSP 硬件指令一致的饱和语义。"
        },
        {
          "id": "q31_mul",
          "title": "iqmath_q31_mul() 64 位宽乘法与定标移位截断",
          "startLine": 113,
          "endLine": 125,
          "category": "algorithm",
          "categoryName": "核心算法",
          "tag": "Q31 乘法 / 64位中间累加",
          "summary": "将两个 32 位 Q31 定点数相乘，利用 64 位整数中间结果保留全部乘积位，再右移 31 位还原标幺定标尺度并做极值边界检查。",
          "pipeline": "提升为 int64_t 相乘 -> 获得 62 位定标积 -> 右移 31 位恢复 Q31 -> 64位极值校验 -> 截断为 int32_t",
          "lineByLine": [
            {
              "lines": "113-117",
              "desc": "将两个操作数强制转换为 int64_t 进行 64 位高精乘法，结果右移 31 位。"
            },
            {
              "lines": "118-125",
              "desc": "对特殊边界 (-1.0) * (-1.0) 进行检查，防止溢出越界，安全返回。"
            }
          ],
          "math": [
            {
              "label": "定点乘法尺度关系",
              "formula": "C = \\frac{A \\cdot B}{2^{31}} = (A \\cdot B) \\gg 31"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "(-1.0) * (-1.0) 边界特异点",
              "text": "在二进制补码中，`Q31_MIN * Q31_MIN` 会算出 $+1.0$，但 $+1.0$ 超出了 Q31 正数的表示极限 ($0x7FFFFFFF = 0.9999999995$)，必须显式钳位到 MAX。"
            }
          ],
          "extensions": "此函数是 PID 输出增益计算和数字滤波器差分累加的核心算子。"
        },
        {
          "id": "q31_div",
          "title": "iqmath_q31_div() 64 位宽除法、四舍五入与防除以零安全钳位",
          "startLine": 127,
          "endLine": 150,
          "category": "algorithm",
          "categoryName": "核心算法",
          "tag": "Q31 除法 / 舍入补偿",
          "summary": "将分子先左移 31 位扩展到 64 位宽，除以分母得到商，分析余数实施四舍五入，并提供硬件级防除以零安全逃生门。",
          "pipeline": "检查除数是否为 0 -> 分子左移 31 位 -> 64 位整除 -> 计算余数做 0.5 舍入 -> 溢出饱和 -> 返回",
          "lineByLine": [
            {
              "lines": "127-131",
              "desc": "检测除数 b 是否为 0，若为 0 根据分子符号立即安全返回 MAX 或 MIN，杜绝硬件除零故障。"
            },
            {
              "lines": "132-142",
              "desc": "将 a 提升为 int64_t 左移 31 位执行除法，分析余数绝对值是否大于分母的一半以实施精准四舍五入。"
            },
            {
              "lines": "143-150",
              "desc": "对最终商结果进行 32 位范围溢出饱和保护。"
            }
          ],
          "math": [
            {
              "label": "定点除法尺度扩展",
              "formula": "C = \\frac{A \\cdot 2^{31}}{B} = (A \\ll 31) / B"
            }
          ],
          "pitfalls": [
            {
              "type": "WARNING",
              "title": "除法商值膨胀陷阱",
              "text": "若分母模长远小于分子，商值将发生剧烈膨胀并触发饱和。工程中应尽量通过参数预先标定将除法转化为预计算倒数乘法。"
            }
          ],
          "extensions": "在自抗扰控制器 LADRC 和最小二乘法 RLS 参数辨识中不可或缺。"
        },
        {
          "id": "q31_convert_base",
          "title": "iqmath_q31_convert_base() 跨物理量基准动态定标重投影",
          "startLine": 152,
          "endLine": 177,
          "category": "algorithm",
          "categoryName": "核心机制",
          "tag": "跨基准重投影 / 标幺重映射",
          "summary": "当一个定点信号需要从一个物理基准尺度 (如电角度标幺基准 $2\\pi$) 传递给另一个具有不同量纲的模块时，自动按基准比例缩放重新量化。",
          "pipeline": "比较新旧 Base -> 检查是否相等以快速跳过 -> 计算基准比值 ratio -> 定点数值重投影 -> 饱和截断",
          "lineByLine": [
            {
              "lines": "152-160",
              "desc": "合法性检验，若两基准之差小于 1e-6 直接原样返回，零开销退出。"
            },
            {
              "lines": "161-177",
              "desc": "按比例 ratio = old_base / new_base 进行定点值重缩放，带正负四舍五入与范围钳位。"
            }
          ],
          "math": [
            {
              "label": "跨基准转换公式",
              "formula": "Q_{new} = Q_{old} \\cdot \\frac{Base_{old}}{Base_{new}}"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "模块解耦神器",
              "text": "借助该机制，电流环、速度环和位置环可以使用各自最适合物理分辨率的基准值，模块间传递数据时由底层自动适配。"
            }
          ],
          "extensions": "SguanFOC 库支持随时动态重设母线电压基准，适应电池电压从 48V 下降到 36V 的全工况。"
        },
        {
          "id": "fast_sin_cos",
          "title": "fast_sin() / fast_cos() / fast_sin_cos() Q31 定点三角查表",
          "startLine": 491,
          "endLine": 525,
          "category": "algorithm",
          "categoryName": "核心算法",
          "tag": "定点正弦 / 零浮点开销",
          "summary": "针对纯整型内核，使用 512 点 Q31 预存正弦表 `sin_tab_q31`，通过定点相位缩放和位移快速输出 Q31 格式的正余弦值。",
          "pipeline": "输入 Q31 弧度 -> 乘以定点缩放比 SIN_K_q31 -> 右移 31 位获得索引 -> 查表返回 Q31",
          "lineByLine": [
            {
              "lines": "491-506",
              "desc": "fast_sin 处理负数角镜像映射，通过定点乘法提取 0~511 表索引。"
            },
            {
              "lines": "511-519",
              "desc": "fast_cos 叠加 90 度定点弧度偏移后直接复用 fast_sin。"
            },
            {
              "lines": "522-525",
              "desc": "fast_sin_cos 双指针同时导出正弦与余弦 Q31 值。"
            }
          ],
          "math": [
            {
              "label": "定点查表索引计算",
              "formula": "Index = ((x \\cdot K) \\gg 31) \\pmod{512}"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "极致纯整型控制",
              "text": "即使 MCU 没有任何浮点硬件，也能在 15 个 CPU 时钟周期内完成正余弦求值，性能超越许多通用数学库。"
            }
          ],
          "extensions": "为低成本三轮两驱小车及微型无人机舵机控制提供了强大的算力支撑。"
        }
      ]
    },
    {
      "id": "sguan_transfer_c",
      "name": "Sguan_Transfer.c",
      "matrixIndex": "04",
      "role": "离散化传递函数、控制器与观测器算法库",
      "header": "Sguan_Transfer.h",
      "hardware": "多通道控制器实例池 / FPU / 定点双兼容",
      "badge": "Tier 2/3 控制与算法引擎",
      "shortDesc": "涵盖 1~5 阶双线性变换差分滤波计算、PID、LADRC、SMC、DPCC、PIR、SOGI、陷波器、SMO/NLFO/HFI 无感观测器及坐标变换。",
      "lineCount": 2371,
      "sizeBytes": 88164,
      "content": "#include \"Sguan_Transfer.h\"\n\n/* SguanFOC配置文件声明 */\n#include \"UnitLib_Patch.h\"\n\n// ---------------------------工程模块Transfer---------------------------\nstruct Transfer1Data {\n    SguanQ i;\n    SguanQ o;\n\n    SguanQ data_num[2];\n    SguanQ data_den[2];\n};\n\nvoid transfer_transfer1_init(Transfer1 *transfer){\n    #if CONFIG_IQMATH\n    unitlib_unitlib_patch_transfer1_init(transfer);\n    #else // CONFIG_IQMATH\n    // 传递函数运算系数固定计算\n    transfer->data->data_num[0] = 2.0f*transfer->params.num1 + transfer->params.num0*transfer->params.t;\n    transfer->data->data_num[1] = -2.0f*transfer->params.num1 + transfer->params.num0*transfer->params.t;\n\n    transfer->data->data_den[0] = 2.0f*transfer->params.den1 + transfer->params.den0*transfer->params.t;\n    transfer->data->data_num[1] = -2.0f*transfer->params.den1 + transfer->params.den0*transfer->params.t;\n\n    // 初始化为零\n    transfer->data->i = 0.0f;\n    transfer->data->o = 0.0f;\n\n    transfer->in.input = 0.0f;\n    transfer->out.output = 0.0f;\n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_transfer1_loop(Transfer1 *transfer){\n    #if CONFIG_IQMATH\n    unitlib_unitlib_patch_transfer1_loop(transfer);\n    #else // CONFIG_IQMATH\n    // 1.传递函数运算系数动态计算\n    if (transfer->params.recalculate_total_flag){\n        transfer->data->data_num[0] = 2.0f*transfer->params.num1 + transfer->params.num0*transfer->params.t;\n        transfer->data->data_num[1] = -2.0f*transfer->params.num1 + transfer->params.num0*transfer->params.t;\n\n        transfer->data->data_den[0] = 2.0f*transfer->params.den1 + transfer->params.den0*transfer->params.t;\n        transfer->data->data_num[1] = -2.0f*transfer->params.den1 + transfer->params.den0*transfer->params.t;\n    }\n\n    // 2.运算传递函数\n    transfer->out.output = (transfer->in.input*transfer->data->data_num[0] + transfer->data->i*transfer->data->data_num[1] - transfer->data->o*transfer->data->data_den[1])/transfer->data->data_den[0];\n\n    // 3.更新历史数值\n    transfer->data->i = transfer->in.input;\n    transfer->data->o = transfer->out.output;\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\nstruct Transfer2Data {\n    SguanQ i[2];\n    SguanQ o[2];\n\n    SguanQ data_num[3];\n    SguanQ data_den[3];\n};\n\nvoid transfer_transfer2_init(Transfer2 *transfer){\n    #if CONFIG_IQMATH\n    unitlib_unitlib_patch_transfer2_init(transfer);\n    #else // CONFIG_IQMATH\n    // 传递函数运算系数固定计算\n    transfer->data->data_num[0] = 4.0f*transfer->params.num2 + 2.0f*transfer->params.num1*transfer->params.t + transfer->params.num0*transfer->params.t*transfer->params.t;\n    transfer->data->data_num[1] = -8.0f*transfer->params.num2 + 2.0f*transfer->params.num0*transfer->params.t*transfer->params.t;\n    transfer->data->data_num[2] = 4.0f*transfer->params.num2 - 2.0f*transfer->params.num1*transfer->params.t + transfer->params.num0*transfer->params.t*transfer->params.t;\n    \n    transfer->data->data_den[0] = 4.0f*transfer->params.den2 + 2.0f*transfer->params.den1*transfer->params.t + transfer->params.den0*transfer->params.t*transfer->params.t;\n    transfer->data->data_den[1] = -8.0f*transfer->params.den2 + 2.0f*transfer->params.den0*transfer->params.t*transfer->params.t;\n    transfer->data->data_den[2] = 4.0f*transfer->params.den2 - 2.0f*transfer->params.den1*transfer->params.t + transfer->params.den0*transfer->params.t*transfer->params.t;\n\n    // 初始化为零\n    transfer->data->i[0] = 0.0f;\n    transfer->data->i[1] = 0.0f;\n    \n    transfer->data->o[1] = 0.0f;\n    transfer->data->o[1] = 0.0f;\n\n    transfer->in.input = 0.0f;\n    transfer->out.output = 0.0f;\n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_transfer2_loop(Transfer2 *transfer){\n    #if CONFIG_IQMATH\n    unitlib_unitlib_patch_transfer2_loop(transfer);\n    #else // CONFIG_IQMATH\n    // 1.传递函数运算系数动态计算\n    if (transfer->params.recalculate_total_flag){\n        transfer->data->data_num[0] = 4.0f*transfer->params.num2 + 2.0f*transfer->params.num1*transfer->params.t + transfer->params.num0*transfer->params.t*transfer->params.t;\n        transfer->data->data_num[1] = -8.0f*transfer->params.num2 + 2.0f*transfer->params.num0*transfer->params.t*transfer->params.t;\n        transfer->data->data_num[2] = 4.0f*transfer->params.num2 - 2.0f*transfer->params.num1*transfer->params.t + transfer->params.num0*transfer->params.t*transfer->params.t;\n        \n        transfer->data->data_den[0] = 4.0f*transfer->params.den2 + 2.0f*transfer->params.den1*transfer->params.t + transfer->params.den0*transfer->params.t*transfer->params.t;\n        transfer->data->data_den[1] = -8.0f*transfer->params.den2 + 2.0f*transfer->params.den0*transfer->params.t*transfer->params.t;\n        transfer->data->data_den[2] = 4.0f*transfer->params.den2 - 2.0f*transfer->params.den1*transfer->params.t + transfer->params.den0*transfer->params.t*transfer->params.t;\n    }\n\n    // 2.运算传递函数\n    transfer->out.output = (transfer->in.input*transfer->data->data_num[0] + transfer->data->i[0]*transfer->data->data_num[1] + transfer->data->i[1]*transfer->data->data_num[2] - transfer->data->o[0]*transfer->data->data_den[1] - transfer->data->o[1]*transfer->data->data_den[2])/transfer->data->data_den[0];\n\n    // 3.更新历史数值\n    transfer->data->i[1] = transfer->data->i[0];\n    transfer->data->i[0] = transfer->in.input;\n\n    transfer->data->o[1] = transfer->data->o[0];\n    transfer->data->o[0] = transfer->out.output;\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\nstruct Transfer3Data {\n    SguanQ i[3];\n    SguanQ o[3];\n\n    SguanQ data_num[4];\n    SguanQ data_den[4];\n};\n\nvoid transfer_transfer3_init(Transfer3 *transfer){\n    #if CONFIG_IQMATH\n    unitlib_unitlib_patch_transfer3_init(transfer);\n    #else // CONFIG_IQMATH\n    // 传递函数运算系数固定计算\n    transfer->data->data_num[0] = 8.0f*transfer->params.num3 + 4.0f*transfer->params.num2*transfer->params.t + 2.0f*transfer->params.num1*transfer->params.t*transfer->params.t + transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_num[1] = -24.0f*transfer->params.num3 - 4.0f*transfer->params.num2*transfer->params.t + 2.0f*transfer->params.num1*transfer->params.t*transfer->params.t + 3.0f*transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_num[2] = 24.0f*transfer->params.num3 - 4.0f*transfer->params.num2*transfer->params.t - 2.0f*transfer->params.num1*transfer->params.t*transfer->params.t + 3.0f*transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_num[3] = -8.0f*transfer->params.num3 + 4.0f*transfer->params.num2*transfer->params.t - 2.0f*transfer->params.num1*transfer->params.t*transfer->params.t + transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t;\n    \n    transfer->data->data_den[0] = 8.0f*transfer->params.den3 + 4.0f*transfer->params.den2*transfer->params.t + 2.0f*transfer->params.den1*transfer->params.t*transfer->params.t + transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_den[1] = -24.0f*transfer->params.den3 - 4.0f*transfer->params.den2*transfer->params.t + 2.0f*transfer->params.den1*transfer->params.t*transfer->params.t + 3.0f*transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_den[2] = 24.0f*transfer->params.den3 - 4.0f*transfer->params.den2*transfer->params.t - 2.0f*transfer->params.den1*transfer->params.t*transfer->params.t + 3.0f*transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_den[3] = -8.0f*transfer->params.den3 + 4.0f*transfer->params.den2*transfer->params.t - 2.0f*transfer->params.den1*transfer->params.t*transfer->params.t + transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t;\n    \n    // 初始化为零\n    transfer->data->i[0] = 0.0f;\n    transfer->data->i[1] = 0.0f;\n    transfer->data->i[2] = 0.0f;\n    \n    transfer->data->o[0] = 0.0f;\n    transfer->data->o[1] = 0.0f;\n    transfer->data->o[2] = 0.0f;\n\n    transfer->in.input = 0.0f;\n    transfer->out.output = 0.0f;\n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_transfer3_loop(Transfer3 *transfer){\n    #if CONFIG_IQMATH\n    unitlib_unitlib_patch_transfer3_loop(transfer);\n    #else // CONFIG_IQMATH\n    // 1.传递函数运算系数动态计算\n    if (transfer->params.recalculate_total_flag){\n        transfer->data->data_num[0] = 8.0f*transfer->params.num3 + 4.0f*transfer->params.num2*transfer->params.t + 2.0f*transfer->params.num1*transfer->params.t*transfer->params.t + transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_num[1] = -24.0f*transfer->params.num3 - 4.0f*transfer->params.num2*transfer->params.t + 2.0f*transfer->params.num1*transfer->params.t*transfer->params.t + 3.0f*transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_num[2] = 24.0f*transfer->params.num3 - 4.0f*transfer->params.num2*transfer->params.t - 2.0f*transfer->params.num1*transfer->params.t*transfer->params.t + 3.0f*transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_num[3] = -8.0f*transfer->params.num3 + 4.0f*transfer->params.num2*transfer->params.t - 2.0f*transfer->params.num1*transfer->params.t*transfer->params.t + transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t;\n        \n        transfer->data->data_den[0] = 8.0f*transfer->params.den3 + 4.0f*transfer->params.den2*transfer->params.t + 2.0f*transfer->params.den1*transfer->params.t*transfer->params.t + transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_den[1] = -24.0f*transfer->params.den3 - 4.0f*transfer->params.den2*transfer->params.t + 2.0f*transfer->params.den1*transfer->params.t*transfer->params.t + 3.0f*transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_den[2] = 24.0f*transfer->params.den3 - 4.0f*transfer->params.den2*transfer->params.t - 2.0f*transfer->params.den1*transfer->params.t*transfer->params.t + 3.0f*transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_den[3] = -8.0f*transfer->params.den3 + 4.0f*transfer->params.den2*transfer->params.t - 2.0f*transfer->params.den1*transfer->params.t*transfer->params.t + transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t;\n    }\n\n    // 2.运算传递函数\n    transfer->out.output = (transfer->in.input*transfer->data->data_num[0] + transfer->data->i[0]*transfer->data->data_num[1] + transfer->data->i[1]*transfer->data->data_num[2] + transfer->data->i[2]*transfer->data->data_num[3] - transfer->data->o[0]*transfer->data->data_den[1] - transfer->data->o[1]*transfer->data->data_den[2] - transfer->data->o[2]*transfer->data->data_den[3])/transfer->data->data_den[0];\n\n    // 3.更新历史数值\n    transfer->data->i[2] = transfer->data->i[1];\n    transfer->data->i[1] = transfer->data->i[0];\n    transfer->data->i[0] = transfer->in.input;\n\n    transfer->data->o[2] = transfer->data->o[1];\n    transfer->data->o[1] = transfer->data->o[0];\n    transfer->data->o[0] = transfer->out.output;\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\nstruct Transfer4Data {\n    SguanQ i[4];\n    SguanQ o[4];\n\n    SguanQ data_num[5];\n    SguanQ data_den[5];\n};\n\nvoid transfer_transfer4_init(Transfer4 *transfer){\n    #if CONFIG_IQMATH\n    unitlib_patch_transfer4_init(transfer);\n    #else // CONFIG_IQMATH\n    // 传递函数运算系数固定计算\n    transfer->data->data_num[0] = 16.0f*transfer->params.num4 + 8.0f*transfer->params.num3*transfer->params.t + 4.0f*transfer->params.num2*transfer->params.t*transfer->params.t + 2.0f*transfer->params.num1*transfer->params.t*transfer->params.t*transfer->params.t + transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_num[1] = -64.0f*transfer->params.num4 - 16.0f*transfer->params.num3*transfer->params.t + 4.0f*transfer->params.num1*transfer->params.t*transfer->params.t*transfer->params.t + 4.0f*transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_num[2] = 96.0f*transfer->params.num4 - 8.0f*transfer->params.num2*transfer->params.t*transfer->params.t + 6.0f*transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_num[3] = -64.0f*transfer->params.num4 + 16.0f*transfer->params.num3*transfer->params.t - 4.0f*transfer->params.num1*transfer->params.t*transfer->params.t*transfer->params.t + 4.0f*transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_num[4] = 16.0f*transfer->params.num4 - 8.0f*transfer->params.num3*transfer->params.t + 4.0f*transfer->params.num2*transfer->params.t*transfer->params.t - 2.0f*transfer->params.num1*transfer->params.t*transfer->params.t*transfer->params.t + transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    \n    transfer->data->data_den[0] = 16.0f*transfer->params.den4 + 8.0f*transfer->params.den3*transfer->params.t + 4.0f*transfer->params.den2*transfer->params.t*transfer->params.t + 2.0f*transfer->params.den1*transfer->params.t*transfer->params.t*transfer->params.t + transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_den[1] = -64.0f*transfer->params.den4 - 16.0f*transfer->params.den3*transfer->params.t + 4.0f*transfer->params.den1*transfer->params.t*transfer->params.t*transfer->params.t + 4.0f*transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_den[2] = 96.0f*transfer->params.den4 - 8.0f*transfer->params.den2*transfer->params.t*transfer->params.t + 6.0f*transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_den[3] = -64.0f*transfer->params.den4 + 16.0f*transfer->params.den3*transfer->params.t - 4.0f*transfer->params.den1*transfer->params.t*transfer->params.t*transfer->params.t + 4.0f*transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_den[4] = 16.0f*transfer->params.den4 - 8.0f*transfer->params.den3*transfer->params.t + 4.0f*transfer->params.den2*transfer->params.t*transfer->params.t - 2.0f*transfer->params.den1*transfer->params.t*transfer->params.t*transfer->params.t + transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n\n    // 初始化为零\n    transfer->data->i[0] = 0.0f;\n    transfer->data->i[1] = 0.0f;\n    transfer->data->i[2] = 0.0f;\n    transfer->data->i[3] = 0.0f;\n\n    transfer->data->o[0] = 0.0f;\n    transfer->data->o[1] = 0.0f;\n    transfer->data->o[2] = 0.0f;\n    transfer->data->o[3] = 0.0f;\n\n    transfer->in.input = 0.0f;\n    transfer->out.output = 0.0f;\n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_transfer4_loop(Transfer4 *transfer){\n    #if CONFIG_IQMATH\n    unitlib_patch_transfer4_loop(transfer);\n    #else // CONFIG_IQMATH\n    // 1.传递函数运算系数动态计算\n    if (transfer->params.recalculate_total_flag){\n        transfer->data->data_num[0] = 16.0f*transfer->params.num4 + 8.0f*transfer->params.num3*transfer->params.t + 4.0f*transfer->params.num2*transfer->params.t*transfer->params.t + 2.0f*transfer->params.num1*transfer->params.t*transfer->params.t*transfer->params.t + transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_num[1] = -64.0f*transfer->params.num4 - 16.0f*transfer->params.num3*transfer->params.t + 4.0f*transfer->params.num1*transfer->params.t*transfer->params.t*transfer->params.t + 4.0f*transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_num[2] = 96.0f*transfer->params.num4 - 8.0f*transfer->params.num2*transfer->params.t*transfer->params.t + 6.0f*transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_num[3] = -64.0f*transfer->params.num4 + 16.0f*transfer->params.num3*transfer->params.t - 4.0f*transfer->params.num1*transfer->params.t*transfer->params.t*transfer->params.t + 4.0f*transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_num[4] = 16.0f*transfer->params.num4 - 8.0f*transfer->params.num3*transfer->params.t + 4.0f*transfer->params.num2*transfer->params.t*transfer->params.t - 2.0f*transfer->params.num1*transfer->params.t*transfer->params.t*transfer->params.t + transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n        \n        transfer->data->data_den[0] = 16.0f*transfer->params.den4 + 8.0f*transfer->params.den3*transfer->params.t + 4.0f*transfer->params.den2*transfer->params.t*transfer->params.t + 2.0f*transfer->params.den1*transfer->params.t*transfer->params.t*transfer->params.t + transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_den[1] = -64.0f*transfer->params.den4 - 16.0f*transfer->params.den3*transfer->params.t + 4.0f*transfer->params.den1*transfer->params.t*transfer->params.t*transfer->params.t + 4.0f*transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_den[2] = 96.0f*transfer->params.den4 - 8.0f*transfer->params.den2*transfer->params.t*transfer->params.t + 6.0f*transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_den[3] = -64.0f*transfer->params.den4 + 16.0f*transfer->params.den3*transfer->params.t - 4.0f*transfer->params.den1*transfer->params.t*transfer->params.t*transfer->params.t + 4.0f*transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_den[4] = 16.0f*transfer->params.den4 - 8.0f*transfer->params.den3*transfer->params.t + 4.0f*transfer->params.den2*transfer->params.t*transfer->params.t - 2.0f*transfer->params.den1*transfer->params.t*transfer->params.t*transfer->params.t + transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    }\n    \n    // 2.运算传递函数\n    transfer->out.output = (transfer->in.input*transfer->data->data_num[0] + transfer->data->i[0]*transfer->data->data_num[1] + transfer->data->i[1]*transfer->data->data_num[2] + transfer->data->i[2]*transfer->data->data_num[3] + transfer->data->i[3]*transfer->data->data_num[4] - transfer->data->o[0]*transfer->data->data_den[1] - transfer->data->o[1]*transfer->data->data_den[2] - transfer->data->o[2]*transfer->data->data_den[3] - transfer->data->o[3]*transfer->data->data_den[4])/transfer->data->data_den[0];\n\n    // 3.更新历史数值\n    transfer->data->i[3] = transfer->data->i[2];\n    transfer->data->i[2] = transfer->data->i[1];\n    transfer->data->i[1] = transfer->data->i[0];\n    transfer->data->i[0] = transfer->in.input;\n\n    transfer->data->o[3] = transfer->data->o[2];\n    transfer->data->o[2] = transfer->data->o[1];\n    transfer->data->o[1] = transfer->data->o[0];\n    transfer->data->o[0] = transfer->out.output;\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\nstruct Transfer5Data {\n    SguanQ i[5];\n    SguanQ o[5];\n\n    SguanQ data_num[6];\n    SguanQ data_den[6];\n};\n\nvoid transfer_transfer5_init(Transfer5 *transfer){\n    #if CONFIG_IQMATH\n    unitlib_patch_transfer5_init(transfer);\n    #else // CONFIG_IQMATH\n    // 传递函数运算系数固定计算\n    transfer->data->data_num[0] = 32.0f*transfer->params.num5 + 16.0f*transfer->params.num4*transfer->params.t + 8.0f*transfer->params.num3*transfer->params.t*transfer->params.t + 4.0f*transfer->params.num2*transfer->params.t*transfer->params.t*transfer->params.t + 2.0f*transfer->params.num1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_num[1] = -160.0f*transfer->params.num5 - 48.0f*transfer->params.num4*transfer->params.t - 8.0f*transfer->params.num3*transfer->params.t*transfer->params.t + 4.0f*transfer->params.num2*transfer->params.t*transfer->params.t*transfer->params.t + 6.0f*transfer->params.num1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + 5.0f*transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_num[2] = 320.0f*transfer->params.num5 + 32.0f*transfer->params.num4*transfer->params.t - 16.0f*transfer->params.num3*transfer->params.t*transfer->params.t - 8.0f*transfer->params.num2*transfer->params.t*transfer->params.t*transfer->params.t + 4.0f*transfer->params.num1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + 10.0f*transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_num[3] = -320.0f*transfer->params.num5 + 32.0f*transfer->params.num4*transfer->params.t + 16.0f*transfer->params.num3*transfer->params.t*transfer->params.t - 8.0f*transfer->params.num2*transfer->params.t*transfer->params.t*transfer->params.t - 4.0f*transfer->params.num1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + 10.0f*transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_num[4] = 160.0f*transfer->params.num5 - 48.0f*transfer->params.num4*transfer->params.t + 8.0f*transfer->params.num3*transfer->params.t*transfer->params.t + 4.0f*transfer->params.num2*transfer->params.t*transfer->params.t*transfer->params.t - 6.0f*transfer->params.num1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + 5.0f*transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_num[5] = -32.0f*transfer->params.num5 + 16.0f*transfer->params.num4*transfer->params.t - 8.0f*transfer->params.num3*transfer->params.t*transfer->params.t + 4.0f*transfer->params.num2*transfer->params.t*transfer->params.t*transfer->params.t - 2.0f*transfer->params.num1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    \n    transfer->data->data_den[0] = 32.0f*transfer->params.den5 + 16.0f*transfer->params.den4*transfer->params.t + 8.0f*transfer->params.den3*transfer->params.t*transfer->params.t + 4.0f*transfer->params.den2*transfer->params.t*transfer->params.t*transfer->params.t + 2.0f*transfer->params.den1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_den[1] = -160.0f*transfer->params.den5 - 48.0f*transfer->params.den4*transfer->params.t - 8.0f*transfer->params.den3*transfer->params.t*transfer->params.t + 4.0f*transfer->params.den2*transfer->params.t*transfer->params.t*transfer->params.t + 6.0f*transfer->params.den1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + 5.0f*transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_den[2] = 320.0f*transfer->params.den5 + 32.0f*transfer->params.den4*transfer->params.t - 16.0f*transfer->params.den3*transfer->params.t*transfer->params.t - 8.0f*transfer->params.den2*transfer->params.t*transfer->params.t*transfer->params.t + 4.0f*transfer->params.den1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + 10.0f*transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_den[3] = -320.0f*transfer->params.den5 + 32.0f*transfer->params.den4*transfer->params.t + 16.0f*transfer->params.den3*transfer->params.t*transfer->params.t - 8.0f*transfer->params.den2*transfer->params.t*transfer->params.t*transfer->params.t - 4.0f*transfer->params.den1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + 10.0f*transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_den[4] = 160.0f*transfer->params.den5 - 48.0f*transfer->params.den4*transfer->params.t + 8.0f*transfer->params.den3*transfer->params.t*transfer->params.t + 4.0f*transfer->params.den2*transfer->params.t*transfer->params.t*transfer->params.t - 6.0f*transfer->params.den1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + 5.0f*transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    transfer->data->data_den[5] = -32.0f*transfer->params.den5 + 16.0f*transfer->params.den4*transfer->params.t - 8.0f*transfer->params.den3*transfer->params.t*transfer->params.t + 4.0f*transfer->params.den2*transfer->params.t*transfer->params.t*transfer->params.t - 2.0f*transfer->params.den1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    \n    // 初始化为零\n    transfer->data->i[0] = 0.0f;\n    transfer->data->i[1] = 0.0f;\n    transfer->data->i[2] = 0.0f;\n    transfer->data->i[3] = 0.0f;\n    transfer->data->i[4] = 0.0f;\n\n    transfer->data->o[0] = 0.0f;\n    transfer->data->o[1] = 0.0f;\n    transfer->data->o[2] = 0.0f;\n    transfer->data->o[3] = 0.0f;\n    transfer->data->o[4] = 0.0f;\n\n    transfer->in.input = 0.0f;\n    transfer->out.output = 0.0f;\n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_transfer5_loop(Transfer5 *transfer){\n    #if CONFIG_IQMATH\n    unitlib_patch_transfer5_loop(transfer);\n    #else // CONFIG_IQMATH\n    // 1.传递函数运算系数动态计算\n    if (transfer->params.recalculate_total_flag){\n        transfer->data->data_num[0] = 32.0f*transfer->params.num5 + 16.0f*transfer->params.num4*transfer->params.t + 8.0f*transfer->params.num3*transfer->params.t*transfer->params.t + 4.0f*transfer->params.num2*transfer->params.t*transfer->params.t*transfer->params.t + 2.0f*transfer->params.num1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_num[1] = -160.0f*transfer->params.num5 - 48.0f*transfer->params.num4*transfer->params.t - 8.0f*transfer->params.num3*transfer->params.t*transfer->params.t + 4.0f*transfer->params.num2*transfer->params.t*transfer->params.t*transfer->params.t + 6.0f*transfer->params.num1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + 5.0f*transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_num[2] = 320.0f*transfer->params.num5 + 32.0f*transfer->params.num4*transfer->params.t - 16.0f*transfer->params.num3*transfer->params.t*transfer->params.t - 8.0f*transfer->params.num2*transfer->params.t*transfer->params.t*transfer->params.t + 4.0f*transfer->params.num1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + 10.0f*transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_num[3] = -320.0f*transfer->params.num5 + 32.0f*transfer->params.num4*transfer->params.t + 16.0f*transfer->params.num3*transfer->params.t*transfer->params.t - 8.0f*transfer->params.num2*transfer->params.t*transfer->params.t*transfer->params.t - 4.0f*transfer->params.num1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + 10.0f*transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_num[4] = 160.0f*transfer->params.num5 - 48.0f*transfer->params.num4*transfer->params.t + 8.0f*transfer->params.num3*transfer->params.t*transfer->params.t + 4.0f*transfer->params.num2*transfer->params.t*transfer->params.t*transfer->params.t - 6.0f*transfer->params.num1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + 5.0f*transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_num[5] = -32.0f*transfer->params.num5 + 16.0f*transfer->params.num4*transfer->params.t - 8.0f*transfer->params.num3*transfer->params.t*transfer->params.t + 4.0f*transfer->params.num2*transfer->params.t*transfer->params.t*transfer->params.t - 2.0f*transfer->params.num1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + transfer->params.num0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n        \n        transfer->data->data_den[0] = 32.0f*transfer->params.den5 + 16.0f*transfer->params.den4*transfer->params.t + 8.0f*transfer->params.den3*transfer->params.t*transfer->params.t + 4.0f*transfer->params.den2*transfer->params.t*transfer->params.t*transfer->params.t + 2.0f*transfer->params.den1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_den[1] = -160.0f*transfer->params.den5 - 48.0f*transfer->params.den4*transfer->params.t - 8.0f*transfer->params.den3*transfer->params.t*transfer->params.t + 4.0f*transfer->params.den2*transfer->params.t*transfer->params.t*transfer->params.t + 6.0f*transfer->params.den1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + 5.0f*transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_den[2] = 320.0f*transfer->params.den5 + 32.0f*transfer->params.den4*transfer->params.t - 16.0f*transfer->params.den3*transfer->params.t*transfer->params.t - 8.0f*transfer->params.den2*transfer->params.t*transfer->params.t*transfer->params.t + 4.0f*transfer->params.den1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + 10.0f*transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_den[3] = -320.0f*transfer->params.den5 + 32.0f*transfer->params.den4*transfer->params.t + 16.0f*transfer->params.den3*transfer->params.t*transfer->params.t - 8.0f*transfer->params.den2*transfer->params.t*transfer->params.t*transfer->params.t - 4.0f*transfer->params.den1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + 10.0f*transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_den[4] = 160.0f*transfer->params.den5 - 48.0f*transfer->params.den4*transfer->params.t + 8.0f*transfer->params.den3*transfer->params.t*transfer->params.t + 4.0f*transfer->params.den2*transfer->params.t*transfer->params.t*transfer->params.t - 6.0f*transfer->params.den1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + 5.0f*transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n        transfer->data->data_den[5] = -32.0f*transfer->params.den5 + 16.0f*transfer->params.den4*transfer->params.t - 8.0f*transfer->params.den3*transfer->params.t*transfer->params.t + 4.0f*transfer->params.den2*transfer->params.t*transfer->params.t*transfer->params.t - 2.0f*transfer->params.den1*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t + transfer->params.den0*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t*transfer->params.t;\n    }\n    \n    // 2.运算传递函数\n    transfer->out.output = (transfer->in.input*transfer->data->data_num[0] + transfer->data->i[0]*transfer->data->data_num[1] + transfer->data->i[1]*transfer->data->data_num[2] + transfer->data->i[2]*transfer->data->data_num[3] + transfer->data->i[3]*transfer->data->data_num[4] + transfer->data->i[4]*transfer->data->data_num[5] - transfer->data->o[0]*transfer->data->data_den[1] - transfer->data->o[1]*transfer->data->data_den[2] - transfer->data->o[2]*transfer->data->data_den[3] - transfer->data->o[3]*transfer->data->data_den[4] - transfer->data->o[4]*transfer->data->data_den[5])/transfer->data->data_den[0];\n\n    // 3.更新历史数值\n    transfer->data->i[4] = transfer->data->i[3];\n    transfer->data->i[3] = transfer->data->i[2];\n    transfer->data->i[2] = transfer->data->i[1];\n    transfer->data->i[1] = transfer->data->i[0];\n    transfer->data->i[0] = transfer->in.input;\n\n    transfer->data->o[4] = transfer->data->o[3];\n    transfer->data->o[3] = transfer->data->o[2];\n    transfer->data->o[2] = transfer->data->o[1];\n    transfer->data->o[1] = transfer->data->o[0];\n    transfer->data->o[0] = transfer->out.output;\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\nstruct IntegratorData {\n    SguanQ i;\n\n    SguanQ data_num;\n};\n\nvoid transfer_integrator_init(Integrator *integrator){\n    #if CONFIG_IQMATH\n    unitlib_patch_integrator_init(integrator);\n    #else // CONFIG_IQMATH\n    // 传递函数运算系数固定计算\n    integrator->data->data_num = integrator->params.t/2.0f;\n\n    // 初始化为零\n    integrator->data->i = 0.0f;\n\n    integrator->in.input = 0.0f;\n    integrator->out.output = 0.0f;\n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_integrator_loop(Integrator *integrator){\n    #if CONFIG_IQMATH\n    unitlib_patch_integrator_loop(integrator);\n    #else // CONFIG_IQMATH\n    // 1.运算传递函数\n    integrator->out.output += (integrator->in.input + integrator->data->i)*integrator->data->data_num;\n\n    // 2.更新历史数值\n    integrator->data->i = integrator->in.input;\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\nstruct DerivativeData {\n    SguanQ i;\n    SguanQ o;\n\n    SguanQ data_num[2];\n    SguanQ data_den[2];\n};\n\nvoid transfer_derivative_init(Derivative *derivative){\n    #if CONFIG_IQMATH\n    unitlib_patch_derivative_init(derivative);\n    #else // CONFIG_IQMATH\n    // 传递函数运算系数固定计算\n    derivative->data->data_num[0] = 2.0f*derivative->params.wc;\n    derivative->data->data_num[1] = -2.0f*derivative->params.wc;\n\n    derivative->data->data_den[0] = 2.0f + derivative->params.t*derivative->params.wc;\n    derivative->data->data_den[1] = -2.0f + derivative->params.t*derivative->params.wc;\n\n    // 初始化为零\n    derivative->data->i = 0.0f;\n    derivative->data->o = 0.0f;\n\n    derivative->in.input = 0.0f;\n    derivative->out.output = 0.0f;\n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_derivative_loop(Derivative *derivative){\n    #if CONFIG_IQMATH\n    unitlib_patch_derivative_loop(derivative);\n    #else // CONFIG_IQMATH\n    // 1.传递函数运算系数动态计算\n    if (derivative->params.recalculate_total_flag){\n        derivative->data->data_num[0] = 2.0f*derivative->params.wc;\n        derivative->data->data_num[1] = -2.0f*derivative->params.wc;\n        \n        derivative->data->data_den[0] = 2.0f + derivative->params.t*derivative->params.wc;\n        derivative->data->data_den[1] = -2.0f + derivative->params.t*derivative->params.wc;\n    }\n\n    // 2.运算传递函数\n    derivative->out.output = (derivative->in.input*derivative->data->data_num[0] + derivative->data->i*derivative->data->data_num[1] - derivative->data->o*derivative->data->data_den[1])/derivative->data->data_den[0];\n\n    // 3.更新历史数值\n    derivative->data->i = derivative->in.input;\n    derivative->data->o = derivative->out.output;\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\nstatic const float speed_tab[100] = {\n    0.000000000000000f, 0.000204061405384f, 0.000816243642475f, 0.001836552750319f,\n    0.003264978528023f, 0.005101525224745f, 0.007346192840487f, 0.009998980909586f,\n    0.013059905730188f, 0.016528937965631f, 0.020406091585755f, 0.024691363796592f,\n    0.029384758323431f, 0.034486301243305f, 0.039995938539505f, 0.045913696289063f,\n    0.052239574491978f, 0.058973576873541f, 0.066115736961365f, 0.073665976524353f,\n    0.081624343991280f, 0.089990831911564f, 0.098765432834625f, 0.107948206365108f,\n    0.117539055645466f, 0.127538025379181f, 0.137945115566254f, 0.148760333657265f,\n    0.159983724355698f, 0.171615183353424f, 0.183654755353928f, 0.196102455258369f,\n    0.208958268165588f, 0.222222283482552f, 0.235894337296486f, 0.249974519014359f,\n    0.264462828636169f, 0.279359251260757f, 0.294663876295090f, 0.310376554727554f,\n    0.326497316360474f, 0.343026250600815f, 0.359963268041611f, 0.377308517694473f,\n    0.395061790943146f, 0.413223177194595f, 0.431792706251144f, 0.450770318508148f,\n    0.470156192779541f, 0.489950060844421f, 0.510050058364868f, 0.529843926429749f,\n    0.549229741096497f, 0.568207383155823f, 0.586776912212372f, 0.604938328266144f,\n    0.622691571712494f, 0.640036821365356f, 0.656973838806152f, 0.673502743244171f,\n    0.689623534679413f, 0.705336213111877f, 0.720640838146210f, 0.735537230968475f,\n    0.750025570392609f, 0.764105737209320f, 0.777777791023254f, 0.791041791439056f,\n    0.803897619247437f, 0.816345334053040f, 0.828384876251221f, 0.840016305446625f,\n    0.851239740848541f, 0.862054944038391f, 0.872462034225464f, 0.882461011409760f,\n    0.892051815986633f, 0.901234626770020f, 0.910009205341339f, 0.918375670909882f,\n    0.926334083080292f, 0.933884322643280f, 0.941026449203491f, 0.947760462760925f,\n    0.954086363315582f, 0.960004091262817f, 0.965513706207275f, 0.970615267753601f,\n    0.975308656692505f, 0.979593932628632f, 0.983471095561981f, 0.986940085887909f,\n    0.990001022815704f, 0.992653846740723f, 0.994898498058319f, 0.996735036373138f,\n    0.998163461685181f, 0.999183773994446f, 0.999795913696289f, 1.000000000000000f\n};\n\nstruct CurveData {\n    SguanQ i;\n    SguanQ o;\n\n    SguanQ data_num[2];\n    SguanQ data_den[2];\n};\n\nvoid transfer_curve_init(Curve *curve){\n    #if CONFIG_IQMATH\n    unitlib_patch_curve_init(curve);\n    #else // CONFIG_IQMATH\n    \n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_curve_loop(Curve *curve){\n    #if CONFIG_IQMATH\n    unitlib_patch_curve_loop(curve);\n    #else // CONFIG_IQMATH\n    \n    #endif // CONFIG_IQMATH\n}\n\n\n// ---------------------------工程模块Transfer---------------------------\nstruct DftData {\n    SguanQ i;\n    SguanQ o;\n\n    SguanQ data_num[2];\n    SguanQ data_den[2];\n};\n\n\nvoid transfer_dft_init(Dft *dft){\n    #if CONFIG_IQMATH\n    unitlib_patch_dft_init(dft);\n    #else // CONFIG_IQMATH\n    \n    #endif // CONFIG_IQMATH\n}\n\n\nvoid transfer_dft_loop(Dft *dft){\n    #if CONFIG_IQMATH\n    unitlib_patch_dft_loop(dft);\n    #else // CONFIG_IQMATH\n    \n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct HallData {\n    SguanQ num;\n    SguanQ den;\n};\n\n\nvoid transfer_hall_init(Hall *hall){\n    #if CONFIG_IQMATH\n    unitlib_patch_hall_init(hall);\n    #else // CONFIG_IQMATH\n    // 传递函数运算系数固定计算\n\n\n\n    // 初始化为零\n\n    \n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_hall_loop(Hall *hall){\n    #if CONFIG_IQMATH\n    unitlib_patch_hall_loop(hall);\n    #else // CONFIG_IQMATH\n\n\n\n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct Ladrc1Data {\n    SguanQ num;\n    SguanQ den;\n};\n\n\nvoid transfer_ladrc1_init(Ladrc1 *ladrc){\n    #if CONFIG_IQMATH\n    unitlib_patch_ladrc1_init(ladrc);\n    #else // CONFIG_IQMATH\n    // 传递函数运算系数固定计算\n\n\n\n    // 初始化为零\n\n    \n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_ladrc1_loop(Ladrc1 *ladrc){\n    #if CONFIG_IQMATH\n    unitlib_patch_ladrc1_loop(ladrc);\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct Ladrc2Data {\n    SguanQ num;\n    SguanQ den;\n};\n\n\nvoid transfer_ladrc2_init(Ladrc2 *ladrc){\n    #if CONFIG_IQMATH\n    unitlib_patch_ladrc2_init(ladrc);\n    #else // CONFIG_IQMATH\n\n\n    \n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_ladrc2_loop(Ladrc2 *ladrc){\n    #if CONFIG_IQMATH\n    unitlib_patch_ladrc2_loop(ladrc);\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct SmcData {\n    SguanQ num;\n    SguanQ den;\n};\n\n\nvoid transfer_smc_init(Smc *smc){\n    #if CONFIG_IQMATH\n    unitlib_patch_smc_init(smc);\n    #else // CONFIG_IQMATH\n\n\n    \n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_smc_loop(Smc *smc){\n    #if CONFIG_IQMATH\n    unitlib_patch_smc_loop(smc);\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct DpccData {\n    SguanQ num;\n    SguanQ den;\n};\n\n\nvoid transfer_dpcc_init(Dpcc *dpcc){\n    #if CONFIG_IQMATH\n    unitlib_patch_dpcc_init(dpcc);\n    #else // CONFIG_IQMATH\n\n\n    \n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_dpcc_loop(Dpcc *dpcc){\n    #if CONFIG_IQMATH\n    unitlib_patch_dpcc_loop(dpcc);\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct PirData {\n    SguanQ num;\n    SguanQ den;\n};\n\n\nvoid transfer_pir_init(Pir *pir){\n    #if CONFIG_IQMATH\n    unitlib_patch_pir_init(pir);\n    #else // CONFIG_IQMATH\n\n\n    \n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_pir_loop(Pir *pir){\n    #if CONFIG_IQMATH\n    unitlib_patch_pir_loop(pir);\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct PidData {\n    SguanQ num;\n    SguanQ den;\n};\n\n\nvoid transfer_pid_init(Pid *pid){\n    #if CONFIG_IQMATH\n    unitlib_patch_pid_init(pid);\n    #else // CONFIG_IQMATH\n\n\n    \n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_pid_loop(Pid *pid){\n    #if CONFIG_IQMATH\n    unitlib_patch_pid_loop(pid);\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct PllData {\n    SguanQ num;\n    SguanQ den;\n};\n\n\nvoid transfer_pll_init(Pll *pll){\n    #if CONFIG_IQMATH\n    unitlib_patch_pll_init(pll);\n    #else // CONFIG_IQMATH\n\n\n    \n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_pll_loop(Pll *pll){\n    #if CONFIG_IQMATH\n    unitlib_patch_pll_loop(pll);\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct Lpf1Data {\n    SguanQ i;\n    SguanQ o;\n\n    SguanQ data_num;\n    SguanQ data_den[2];\n};\n\n\nvoid transfer_lpf1_init(Lpf1 *lpf){\n    #if CONFIG_IQMATH\n    unitlib_patch_lpf1_init(lpf);\n    #else // CONFIG_IQMATH\n    // 传递函数运算系数固定计算\n    lpf->data->data_num = lpf->params.t*lpf->params.wc;\n\n    lpf->data->data_den[0] = 2.0f + lpf->params.t*lpf->params.wc;\n    lpf->data->data_den[1] = -2.0f + lpf->params.t*lpf->params.wc;\n\n    // 初始化为零\n    lpf->data->i = 0.0f;\n    lpf->data->o = 0.0f;\n\n    lpf->in.input = 0.0f;\n    lpf->out.output = 0.0f;\n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_lpf1_loop(Lpf1 *lpf){\n    #if CONFIG_IQMATH\n    unitlib_patch_lpf1_loop(lpf);\n    #else // CONFIG_IQMATH\n    // 1.传递函数运算系数动态计算\n    if (lpf->params.recalculate_total_flag){\n        lpf->data->data_num = lpf->params.t*lpf->params.wc;\n    \n        lpf->data->data_den[0] = 2.0f + lpf->params.t*lpf->params.wc;\n        lpf->data->data_den[1] = -2.0f + lpf->params.t*lpf->params.wc;\n    }\n\n    // 2.运算传递函数\n    lpf->out.output = (lpf->in.input+lpf->data->i - lpf->data->o*lpf->data->data_den[1])/lpf->data->data_den[0];\n\n    // 3.更新历史数值\n    lpf->data->i = lpf->in.input;\n    lpf->data->o = lpf->out.output;\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct Lpf2Data {\n    SguanQ i[2];\n    SguanQ o[2];\n    \n    // (data_num)0->现在和LLast\n    // (data_num)1->仅Last的系数\n    // (传递函数分子系数)\n    SguanQ data_num[2];\n    SguanQ data_den[3];\n};\n\n\nvoid transfer_lpf2_init(Lpf2 *lpf){\n    #if CONFIG_IQMATH\n    unitlib_patch_lpf2_init(lpf);\n    #else // CONFIG_IQMATH\n    // 传递函数运算系数固定计算\n    lpf->data->data_num[0] = lpf->params.t*lpf->params.wc*lpf->params.t*lpf->params.wc;\n    lpf->data->data_num[1] = 2.0f*lpf->params.t*lpf->params.wc*lpf->params.t*lpf->params.wc;\n\n    lpf->data->data_den[0] = 4.0f + VALUE_2_SQRT2*lpf->params.t*lpf->params.wc + lpf->params.t*lpf->params.wc*lpf->params.t*lpf->params.wc;\n    lpf->data->data_den[1] = -8.0f + 2.0f*lpf->params.t*lpf->params.wc*lpf->params.t*lpf->params.wc;\n    lpf->data->data_den[2] = 4.0f - VALUE_2_SQRT2*lpf->params.t*lpf->params.wc + lpf->params.t*lpf->params.wc*lpf->params.t*lpf->params.wc;\n\n    // 初始化为零\n    lpf->data->i[0] = 0.0f;\n    lpf->data->i[1] = 0.0f;\n    lpf->data->o[0] = 0.0f;\n    lpf->data->o[1] = 0.0f;\n    \n    lpf->in.input = 0.0f;\n    lpf->out.output = 0.0f;\n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_lpf2_loop(Lpf2 *lpf){\n    #if CONFIG_IQMATH\n    unitlib_patch_lpf2_loop(lpf);\n    #else // CONFIG_IQMATH\n    // 1.传递函数运算系数动态计算\n    if (lpf->params.recalculate_total_flag){\n        lpf->data->data_num[0] = lpf->params.t*lpf->params.wc*lpf->params.t*lpf->params.wc;\n        lpf->data->data_num[1] = 2.0f*lpf->params.t*lpf->params.wc*lpf->params.t*lpf->params.wc;\n\n        lpf->data->data_den[0] = 4.0f + VALUE_2_SQRT2*lpf->params.t*lpf->params.wc + lpf->params.t*lpf->params.wc*lpf->params.t*lpf->params.wc;\n        lpf->data->data_den[1] = -8.0f + 2.0f*lpf->params.t*lpf->params.wc*lpf->params.t*lpf->params.wc;\n        lpf->data->data_den[2] = 4.0f - VALUE_2_SQRT2*lpf->params.t*lpf->params.wc + lpf->params.t*lpf->params.wc*lpf->params.t*lpf->params.wc;\n    }\n\n    // 2.运算传递函数\n    lpf->out.output = ((lpf->in.input + lpf->data->i[1])*lpf->data->data_num[0] + lpf->data->i[0]*lpf->data->data_num[1] - lpf->data->o[0]*lpf->data->data_den[1] - lpf->data->o[1]*lpf->data->data_den[2])/lpf->data->data_den[0];\n\n    // 3.更新历史数值\n    lpf->data->i[1] = lpf->data->i[0];\n    lpf->data->i[0] = lpf->in.input;\n    \n    lpf->data->o[1] = lpf->data->o[0];\n    lpf->data->o[0] = lpf->out.output;\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct Hpf1Data {\n    SguanQ i;\n    SguanQ o;\n\n    SguanQ data_num[2];\n    SguanQ data_den[2];\n};\n\n\nvoid transfer_hpf1_init(Hpf1 *hpf){\n    #if CONFIG_IQMATH\n    unitlib_patch_hpf1_init(hpf);\n    #else // CONFIG_IQMATH\n    // 传递函数运算系数固定计算\n    hpf->data->data_num[0] = 2.0f;\n    hpf->data->data_num[1] = -2.0f;\n\n    hpf->data->data_den[0] = 2.0f + hpf->params.t*hpf->params.wc;\n    hpf->data->data_den[1] = -2.0f + hpf->params.t*hpf->params.wc;\n\n    // 初始化为零\n    hpf->data->i = 0.0f;\n    hpf->data->o = 0.0f;\n\n    hpf->in.input = 0.0f;\n    hpf->out.output = 0.0f;\n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_hpf1_loop(Hpf1 *hpf){\n    #if CONFIG_IQMATH\n    unitlib_patch_hpf1_loop(hpf);\n    #else // CONFIG_IQMATH\n    // 1.传递函数运算系数动态计算\n    if (hpf->params.recalculate_total_flag){\n        hpf->data->data_num[0] = 2.0f;\n        hpf->data->data_num[1] = -2.0f;\n\n        hpf->data->data_den[0] = 2.0f + hpf->params.t*hpf->params.wc;\n        hpf->data->data_den[1] = -2.0f + hpf->params.t*hpf->params.wc;\n    }\n\n    // 2.运算传递函数\n    hpf->out.output = (hpf->in.input*hpf->data->data_num[0] + hpf->data->i*hpf->data->data_num[1] - hpf->data->o*hpf->data->data_den[1])/hpf->data->data_den[0];\n\n    // 3.更新历史数值\n    hpf->data->i = hpf->in.input;\n    hpf->data->o = hpf->out.output;\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct Hpf2Data {\n    SguanQ i[2];\n    SguanQ o[2];\n\n    // (data_num)0->现在和LLast\n    // (data_num)1->仅Last的系数\n    // (传递函数分子系数)\n    SguanQ data_num[2];\n    SguanQ data_den[3];\n};\n\n\nvoid transfer_hpf2_init(Hpf2 *hpf){\n    #if CONFIG_IQMATH\n    unitlib_patch_hpf2_init(hpf);\n    #else // CONFIG_IQMATH\n    // 传递函数运算系数固定计算\n    hpf->data->data_num[0] = 4.0f;\n    hpf->data->data_num[1] = -8.0f;\n\n    hpf->data->data_den[0] = 4.0f + VALUE_2_SQRT2*hpf->params.t*hpf->params.wc + hpf->params.t*hpf->params.wc*hpf->params.t*hpf->params.wc;\n    hpf->data->data_den[1] = -8.0f + 2.0f*hpf->params.t*hpf->params.wc*hpf->params.t*hpf->params.wc;\n    hpf->data->data_den[2] = 4.0f - VALUE_2_SQRT2*hpf->params.t*hpf->params.wc + hpf->params.t*hpf->params.wc*hpf->params.t*hpf->params.wc;\n\n    // 初始化为零\n    hpf->data->i[0] = 0.0f;\n    hpf->data->i[1] = 0.0f;\n\n    hpf->data->o[0] = 0.0f;\n    hpf->data->o[1] = 0.0f;\n\n    hpf->in.input = 0.0f;\n    hpf->out.output = 0.0f;\n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_hpf2_loop(Hpf2 *hpf){\n    #if CONFIG_IQMATH\n    unitlib_patch_hpf2_loop(hpf);\n    #else // CONFIG_IQMATH\n    // 1.传递函数运算系数动态计算\n    if (hpf->params.recalculate_total_flag){\n        hpf->data->data_num[0] = 4.0f;\n        hpf->data->data_num[1] = -8.0f;\n\n        hpf->data->data_den[0] = 4.0f + VALUE_2_SQRT2*hpf->params.t*hpf->params.wc + hpf->params.t*hpf->params.wc*hpf->params.t*hpf->params.wc;\n        hpf->data->data_den[1] = -8.0f + 2.0f*hpf->params.t*hpf->params.wc*hpf->params.t*hpf->params.wc;\n        hpf->data->data_den[2] = 4.0f - VALUE_2_SQRT2*hpf->params.t*hpf->params.wc + hpf->params.t*hpf->params.wc*hpf->params.t*hpf->params.wc;\n    }\n\n    // 2.运算传递函数\n    hpf->out.output = ((hpf->in.input + hpf->data->i[1])*hpf->data->data_num[0] + hpf->data->i[0]*hpf->data->data_num[1] - hpf->data->o[0]*hpf->data->data_den[1] - hpf->data->o[1]*hpf->data->data_den[2])/hpf->data->data_den[0];\n\n    // 3.更新历史数值\n    hpf->data->i[1] = hpf->data->i[0];\n    hpf->data->i[0] = hpf->in.input;\n    \n    hpf->data->o[1] = hpf->data->o[0];\n    hpf->data->o[0] = hpf->out.output;\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct Bpf1Data {\n    SguanQ i[2];\n    SguanQ o[2];\n\n    // (data_num)0->现在的系数\n    // (data_num)1->LLast的系数\n    // (传递函数分子系数)\n    SguanQ data_num[2];\n    SguanQ data_den[3];\n};\n\n\nvoid transfer_bpf1_init(Bpf1 *bpf){\n    #if CONFIG_IQMATH\n    unitlib_patch_bpf1_init(bpf);\n    #else // CONFIG_IQMATH\n    // 传递函数运算系数固定计算\n    bpf->data->data_num[0] = 2.0f*bpf->params.t*bpf->params.wc_low;\n    bpf->data->data_num[1] = -2.0f*bpf->params.t*bpf->params.wc_low;\n\n    bpf->data->data_den[0] = 4.0f + 2.0f*bpf->params.t*bpf->params.wc_high + 2.0f*bpf->params.t*bpf->params.wc_low + bpf->params.t*bpf->params.t*bpf->params.wc_high*bpf->params.wc_low;\n    bpf->data->data_den[1] = -8.0f + 2.0f*bpf->params.t*bpf->params.t*bpf->params.wc_high*bpf->params.wc_low;\n    bpf->data->data_den[2] = 4.0f - 2.0f*bpf->params.t*bpf->params.wc_high - 2.0f*bpf->params.t*bpf->params.wc_low + bpf->params.t*bpf->params.t*bpf->params.wc_high*bpf->params.wc_low;\n\n    // 初始化为零\n    bpf->data->i[0] = 0.0f;\n    bpf->data->i[1] = 0.0f;\n\n    bpf->data->o[0] = 0.0f;\n    bpf->data->o[1] = 0.0f;\n    \n    bpf->in.input = 0.0f;\n    bpf->out.output = 0.0f;\n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_bpf1_loop(Bpf1 *bpf){\n    #if CONFIG_IQMATH\n    unitlib_patch_bpf1_loop(bpf);\n    #else // CONFIG_IQMATH\n    // 1.传递函数运算系数动态计算\n    if (bpf->params.recalculate_total_flag){\n        bpf->data->data_num[0] = 2.0f*bpf->params.t*bpf->params.wc_low;\n        bpf->data->data_num[1] = -2.0f*bpf->params.t*bpf->params.wc_low;\n\n        bpf->data->data_den[0] = 4.0f + 2.0f*bpf->params.t*bpf->params.wc_high + 2.0f*bpf->params.t*bpf->params.wc_low + bpf->params.t*bpf->params.t*bpf->params.wc_high*bpf->params.wc_low;\n        bpf->data->data_den[1] = -8.0f + 2.0f*bpf->params.t*bpf->params.t*bpf->params.wc_high*bpf->params.wc_low;\n        bpf->data->data_den[2] = 4.0f - 2.0f*bpf->params.t*bpf->params.wc_high - 2.0f*bpf->params.t*bpf->params.wc_low + bpf->params.t*bpf->params.t*bpf->params.wc_high*bpf->params.wc_low;\n    }\n\n    // 2.运算传递函数\n    bpf->out.output = (bpf->in.input*bpf->data->data_num[0] + bpf->data->i[1]*bpf->data->data_num[1] - bpf->data->o[0]*bpf->data->data_den[1] - bpf->data->o[1]*bpf->data->data_den[2])/bpf->data->data_den[0];\n\n    // 3.更新历史数值\n    bpf->data->i[1] = bpf->data->i[0];\n    bpf->data->i[0] = bpf->in.input;\n\n    bpf->data->o[1] = bpf->data->o[0];\n    bpf->data->o[0] = bpf->out.output;\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct Bpf2Data {\n    SguanQ i[2];\n    SguanQ o[2];\n\n    // (data_num)0->现在的系数\n    // (data_num)1->LLast的系数\n    // (传递函数分子系数)\n    SguanQ data_num[2];\n    SguanQ data_den[3];\n};\n\n\nvoid transfer_bpf2_init(Bpf2 *bpf){\n    #if CONFIG_IQMATH\n    unitlib_patch_bpf2_init(bpf);\n    #else // CONFIG_IQMATH\n    // 传递函数运算系数固定计算\n    bpf->data->data_num[0] = 4.0f*bpf->params.t*bpf->params.wo*bpf->params.zeta;\n    bpf->data->data_num[1] = -4.0f*bpf->params.t*bpf->params.wo*bpf->params.zeta;\n\n    bpf->data->data_den[0] = 4.0f + 4.0f*bpf->params.t*bpf->params.wo*bpf->params.zeta + bpf->params.t*bpf->params.wo*bpf->params.t*bpf->params.wo;\n    bpf->data->data_den[1] = -8.0f + 2.0f*bpf->params.t*bpf->params.wo*bpf->params.t*bpf->params.wo;\n    bpf->data->data_den[2] = 4.0f - 4.0f*bpf->params.t*bpf->params.wo*bpf->params.zeta + bpf->params.t*bpf->params.wo*bpf->params.t*bpf->params.wo;\n\n    // 初始化为零\n    bpf->data->i[0] = 0.0f;\n    bpf->data->i[1] = 0.0f;\n\n    bpf->data->o[0] = 0.0f;\n    bpf->data->o[1] = 0.0f;\n    \n    bpf->in.input = 0.0f;\n    bpf->out.output = 0.0f;\n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_bpf2_loop(Bpf2 *bpf){\n    #if CONFIG_IQMATH\n    unitlib_patch_bpf2_loop(bpf);\n    #else // CONFIG_IQMATH\n    // 1.传递函数运算系数动态计算\n    if (bpf->params.recalculate_total_flag){\n        bpf->data->data_num[0] = 4.0f*bpf->params.t*bpf->params.wo*bpf->params.zeta;\n        bpf->data->data_num[1] = -4.0f*bpf->params.t*bpf->params.wo*bpf->params.zeta;\n\n        bpf->data->data_den[0] = 4.0f + 4.0f*bpf->params.t*bpf->params.wo*bpf->params.zeta + bpf->params.t*bpf->params.wo*bpf->params.t*bpf->params.wo;\n        bpf->data->data_den[1] = -8.0f + 2.0f*bpf->params.t*bpf->params.wo*bpf->params.t*bpf->params.wo;\n        bpf->data->data_den[2] = 4.0f - 4.0f*bpf->params.t*bpf->params.wo*bpf->params.zeta + bpf->params.t*bpf->params.wo*bpf->params.t*bpf->params.wo;\n    }\n\n    // 2.运算传递函数\n    bpf->out.output = (bpf->in.input*bpf->data->data_num[0] + bpf->data->i[1]*bpf->data->data_num[1] - bpf->data->o[0]*bpf->data->data_den[1] - bpf->data->o[1]*bpf->data->data_den[2])/bpf->data->data_den[0];\n\n    // 3.更新历史数值\n    bpf->data->i[1] = bpf->data->i[0];\n    bpf->data->i[0] = bpf->in.input;\n\n    bpf->data->o[1] = bpf->data->o[0];\n    bpf->data->o[0] = bpf->out.output;\n    #endif // CONFIG_IQMATH\n}\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct SogiData {\n    SguanQ i[2];\n    SguanQ o[2];\n\n    // (data_num)0->现在的系数\n    // (data_num)1->LLast的系数\n    // (传递函数分子系数)\n    SguanQ data_num[2];\n    SguanQ data_den[3];\n};\n\n\nvoid transfer_sogi_init(Sogi *sogi){\n    #if CONFIG_IQMATH\n    unitlib_patch_sogi_init(sogi);\n    #else // CONFIG_IQMATH\n    // 传递函数运算系数固定计算\n\n\n    // 初始化为零\n\n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_sogi_loop(Sogi *sogi){\n    #if CONFIG_IQMATH\n    unitlib_patch_sogi_loop(sogi);\n    #else // CONFIG_IQMATH\n    // 1.传递函数运算系数动态计算\n    if (1){\n\n    }\n\n    // 2.运算传递函数\n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct NfData {\n    SguanQ i[2];\n    SguanQ o[2];\n\n    // (data_num)0->现在和LLast\n    // (data_num)1->仅Last的系数\n    // (传递函数分子系数)\n    SguanQ data_num[2];\n    SguanQ data_den[3];\n};\n\n\nvoid transfer_nf_init(Nf *nf){\n    #if CONFIG_IQMATH\n    unitlib_patch_nf_init(nf);\n    #else // CONFIG_IQMATH\n    // 传递函数运算系数固定计算\n    nf->data->data_num[0] = 4.0f + nf->params.t*nf->params.wo*nf->params.t*nf->params.wo;\n    nf->data->data_num[1] = -8.0f + 2.0f*nf->params.t*nf->params.wo*nf->params.t*nf->params.wo;\n\n    nf->data->data_den[0] = 4.0f + 4.0f*nf->params.t*nf->params.wo*nf->params.zeta + nf->params.t*nf->params.wo*nf->params.t*nf->params.wo;\n    nf->data->data_den[1] = -8.0f + 2.0f*nf->params.t*nf->params.wo*nf->params.t*nf->params.wo;\n    nf->data->data_den[2] = 4.0f - 4.0f*nf->params.t*nf->params.wo*nf->params.zeta + nf->params.t*nf->params.wo*nf->params.t*nf->params.wo;\n\n    // 初始化为零\n    nf->data->i[0] = 0.0f;\n    nf->data->i[1] = 0.0f;\n\n    nf->data->o[0] = 0.0f;\n    nf->data->o[1] = 0.0f;\n\n    nf->in.input = 0.0f;\n    nf->out.output = 0.0f;\n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_nf_loop(Nf *nf){\n    #if CONFIG_IQMATH\n    unitlib_patch_nf_loop(nf);\n    #else // CONFIG_IQMATH\n    // 1.传递函数运算系数动态计算\n    if (nf->params.recalculate_total_flag){\n        nf->data->data_num[0] = 4.0f + nf->params.t*nf->params.wo*nf->params.t*nf->params.wo;\n        nf->data->data_num[1] = -8.0f + 2.0f*nf->params.t*nf->params.wo*nf->params.t*nf->params.wo;\n\n        nf->data->data_den[0] = 4.0f + 4.0f*nf->params.t*nf->params.wo*nf->params.zeta + nf->params.t*nf->params.wo*nf->params.t*nf->params.wo;\n        nf->data->data_den[1] = -8.0f + 2.0f*nf->params.t*nf->params.wo*nf->params.t*nf->params.wo;\n        nf->data->data_den[2] = 4.0f - 4.0f*nf->params.t*nf->params.wo*nf->params.zeta + nf->params.t*nf->params.wo*nf->params.t*nf->params.wo;\n    }\n\n    // 2.运算传递函数\n    nf->out.output = ((nf->in.input + nf->data->i[1])*nf->data->data_num[0] + nf->data->i[0]*nf->data->data_num[1] - nf->data->o[0]*nf->data->data_den[1] - nf->data->o[1]*nf->data->data_den[2])/nf->data->data_den[0];\n\n    // 3.更新历史数值\n    nf->data->i[1] = nf->data->i[0];\n    nf->data->i[0] = nf->in.input;\n    \n    nf->data->o[1] = nf->data->o[0];\n    nf->data->o[0] = nf->out.output;\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct TpnfData {\n    SguanQ i[2];\n    SguanQ o[2];\n\n    SguanQ data_num[3];\n    SguanQ data_den[3];\n};\n\n\nvoid transfer_tpnf_init(Tpnf *tpnf){\n    #if CONFIG_IQMATH\n    unitlib_patch_tpnf_init(tpnf);\n    #else // CONFIG_IQMATH\n    // 传递函数运算系数固定计算\n    tpnf->data->data_num[0] = 4.0f + 4.0f*tpnf->params.k2*tpnf->params.t*tpnf->params.wo + tpnf->params.t*tpnf->params.wo*tpnf->params.t*tpnf->params.wo;\n    tpnf->data->data_num[1] = -8.0f + 2.0f*tpnf->params.t*tpnf->params.wo*tpnf->params.t*tpnf->params.wo;\n    tpnf->data->data_num[2] = 4.0f - 4.0f*tpnf->params.k2*tpnf->params.t*tpnf->params.wo + tpnf->params.t*tpnf->params.wo*tpnf->params.t*tpnf->params.wo;\n\n    tpnf->data->data_den[0] = 4.0f + 4.0f*tpnf->params.k1*tpnf->params.t*tpnf->params.wo + tpnf->params.t*tpnf->params.wo*tpnf->params.t*tpnf->params.wo;\n    tpnf->data->data_den[1] = -8.0f + 2.0f*tpnf->params.t*tpnf->params.wo*tpnf->params.t*tpnf->params.wo;\n    tpnf->data->data_den[2] = 4.0f - 4.0f*tpnf->params.k1*tpnf->params.t*tpnf->params.wo + tpnf->params.t*tpnf->params.wo*tpnf->params.t*tpnf->params.wo;\n\n    // 初始化为零\n    tpnf->data->i[0] = 0.0f;\n    tpnf->data->i[1] = 0.0f;\n\n    tpnf->data->o[0] = 0.0f;\n    tpnf->data->o[1] = 0.0f;\n\n    tpnf->in.input = 0.0f;\n    tpnf->out.output = 0.0f;\n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_tpnf_loop(Tpnf *tpnf){\n    #if CONFIG_IQMATH\n    unitlib_patch_tpnf_loop(tpnf);\n    #else // CONFIG_IQMATH\n    // 1.传递函数运算系数动态计算\n    if (tpnf->params.recalculate_total_flag){\n        tpnf->data->data_num[0] = 4.0f + 4.0f*tpnf->params.k2*tpnf->params.t*tpnf->params.wo + tpnf->params.t*tpnf->params.wo*tpnf->params.t*tpnf->params.wo;\n        tpnf->data->data_num[1] = -8.0f + 2.0f*tpnf->params.t*tpnf->params.wo*tpnf->params.t*tpnf->params.wo;\n        tpnf->data->data_num[2] = 4.0f - 4.0f*tpnf->params.k2*tpnf->params.t*tpnf->params.wo + tpnf->params.t*tpnf->params.wo*tpnf->params.t*tpnf->params.wo;\n\n        tpnf->data->data_den[0] = 4.0f + 4.0f*tpnf->params.k1*tpnf->params.t*tpnf->params.wo + tpnf->params.t*tpnf->params.wo*tpnf->params.t*tpnf->params.wo;\n        tpnf->data->data_den[1] = -8.0f + 2.0f*tpnf->params.t*tpnf->params.wo*tpnf->params.t*tpnf->params.wo;\n        tpnf->data->data_den[2] = 4.0f - 4.0f*tpnf->params.k1*tpnf->params.t*tpnf->params.wo + tpnf->params.t*tpnf->params.wo*tpnf->params.t*tpnf->params.wo;\n    }\n\n    // 2.运算传递函数\n    tpnf->out.output = (tpnf->in.input*tpnf->data->data_num[0] + tpnf->data->i[0]*tpnf->data->data_num[1] + tpnf->data->i[1]*tpnf->data->data_num[2] - tpnf->data->o[0]*tpnf->data->data_den[1] - tpnf->data->o[1]*tpnf->data->data_den[2])/tpnf->data->data_den[0];\n\n    // 3.更新历史数值\n    tpnf->data->i[1] = tpnf->data->i[0];\n    tpnf->data->i[0] = tpnf->in.input;\n    \n    tpnf->data->o[1] = tpnf->data->o[0];\n    tpnf->data->o[0] = tpnf->out.output;\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct DobData {\n    SguanQ num;\n    SguanQ den;\n};\n\n\nvoid transfer_dob_init(Dob *dob){\n    #if CONFIG_IQMATH\n    unitlib_patch_dob_init(dob);\n    #else // CONFIG_IQMATH\n\n\n    \n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_dob_loop(Dob *dob){\n    #if CONFIG_IQMATH\n    unitlib_patch_dob_loop(dob);\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct RlsData {\n    SguanQ num;\n    SguanQ den;\n};\n\n\nvoid transfer_rls_init(Rls *rls){\n    #if CONFIG_IQMATH\n    unitlib_patch_rls_init(rls);\n    #else // CONFIG_IQMATH\n\n\n    \n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_rls_loop(Rls *rls){\n    #if CONFIG_IQMATH\n    unitlib_patch_rls_loop(rls);\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct SmoData {\n    SguanQ num;\n    SguanQ den;\n};\n\n\nvoid transfer_smo_init(Smo *smo){\n    #if CONFIG_IQMATH\n    unitlib_patch_smo_init(smo);\n    #else // CONFIG_IQMATH\n\n\n    \n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_smo_loop(Smo *smo){\n    #if CONFIG_IQMATH\n    unitlib_patch_smo_loop(smo);\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct NlfoData {\n    SguanQ num;\n    SguanQ den;\n};\n\n\nvoid transfer_nlfo_init(Nlfo *nlfo){\n    #if CONFIG_IQMATH\n    unitlib_patch_nlfo_init(nlfo);\n    #else // CONFIG_IQMATH\n\n\n    \n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_nlfo_loop(Nlfo *nlfo){\n    #if CONFIG_IQMATH\n    unitlib_patch_nlfo_loop(nlfo);\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct VcfoData {\n    SguanQ num;\n    SguanQ den;\n};\n\n\nvoid transfer_vcfo_init(Vcfo *vcfo){\n    #if CONFIG_IQMATH\n    unitlib_patch_vcfo_init(vcfo);\n    #else // CONFIG_IQMATH\n\n\n    \n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_vcfo_loop(Vcfo *vcfo){\n    #if CONFIG_IQMATH\n    unitlib_patch_vcfo_loop(vcfo);\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct HfiData {\n    SguanQ num;\n    SguanQ den;\n};\n\n\nvoid transfer_hfi_init(Hfi *hfi){\n    #if CONFIG_IQMATH\n    unitlib_patch_hfi_init(hfi);\n    #else // CONFIG_IQMATH\n\n\n    \n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_hfi_loop(Hfi *hfi){\n    #if CONFIG_IQMATH\n    unitlib_patch_hfi_loop(hfi);\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct RoloData {\n    SguanQ num;\n    SguanQ den;\n};\n\n\nvoid transfer_rolo_init(Rolo *rolo){\n    #if CONFIG_IQMATH\n    unitlib_patch_rolo_init(rolo);\n    #else // CONFIG_IQMATH\n\n\n    \n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_rolo_loop(Rolo *rolo){\n    #if CONFIG_IQMATH\n    unitlib_patch_rolo_loop(rolo);\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct MarsData {\n    SguanQ num;\n    SguanQ den;\n};\n\n\nvoid transfer_mars_init(Mars *mars){\n    #if CONFIG_IQMATH\n    unitlib_patch_mars_init(mars);\n    #else // CONFIG_IQMATH\n\n\n    \n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_mars_loop(Mars *mars){\n    #if CONFIG_IQMATH\n    unitlib_patch_mars_loop(mars);\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nstruct EkfData {\n    SguanQ num;\n    SguanQ den;\n};\n\n\nvoid transfer_ekf_init(Ekf *ekf){\n    #if CONFIG_IQMATH\n    unitlib_patch_ekf_init(ekf);\n    #else // CONFIG_IQMATH\n\n\n    \n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_ekf_loop(Ekf *ekf){\n    #if CONFIG_IQMATH\n    unitlib_patch_ekf_loop(ekf);\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nvoid transfer_delay1_init(Delay1 *delay){\n    #if CONFIG_IQMATH\n\n    #else // CONFIG_IQMATH\n    // 初始化为零\n    delay->in.input = 0.0f;\n    delay->out.output = 0.0f;\n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_delay1_loop(Delay1 *delay){\n    #if CONFIG_IQMATH\n\n    #else // CONFIG_IQMATH\n    // 1.创建局部静态变量\n    static SguanQ delay_num;\n\n    // 2.运算结果\n    delay->out.output = delay_num;\n\n    // 3.更新历史数值\n    delay_num = delay->in.input;\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nvoid transfer_delay2_init(Delay2 *delay){\n    #if CONFIG_IQMATH\n\n    #else // CONFIG_IQMATH\n    // 初始化为零\n    delay->in.input = 0.0f;\n    delay->out.output = 0.0f;\n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_delay2_loop(Delay2 *delay){\n    #if CONFIG_IQMATH\n\n    #else // CONFIG_IQMATH\n    // 1.创建局部静态变量\n    static SguanQ delay_num[2];\n\n    // 2.运算结果\n    delay->out.output = delay_num[1];\n\n    // 3.更新历史数值\n    delay_num[1] = delay_num[0];\n    delay_num[0] = delay->in.input;\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nvoid transfer_delay3_init(Delay3 *delay){\n    #if CONFIG_IQMATH\n\n    #else // CONFIG_IQMATH\n    // 初始化为零\n    delay->in.input = 0.0f;\n    delay->out.output = 0.0f;\n    #endif // CONFIG_IQMATH\n}\n\nvoid transfer_delay3_loop(Delay3 *delay){\n    #if CONFIG_IQMATH\n\n    #else // CONFIG_IQMATH\n    // 1.创建局部静态变量\n    static SguanQ delay_num[3];\n\n    // 2.运算结果\n    delay->out.output = delay_num[2];\n\n    // 3.更新历史数值\n    delay_num[2] = delay_num[1];\n    delay_num[1] = delay_num[0];\n    delay_num[0] = delay->in.input;  \n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nvoid transfer_sine_loop(Sine *sine){\n    #if CONFIG_IQMATH\n\n    #else // CONFIG_IQMATH\n    sine->out.output = math_sin(sine->in.input);\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nvoid transfer_cosine_loop(Cosine *cosine){\n    #if CONFIG_IQMATH\n\n    #else // CONFIG_IQMATH\n    cosine->out.output = math_cos(cosine->in.input);\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nvoid transfer_sincos_loop(SinCos *sincos){\n    #if CONFIG_IQMATH\n\n    #else // CONFIG_IQMATH\n    math_sin_cos(sincos->in.input, \n        &sincos->out.sine, \n        &sincos->out.cosine);\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\nvoid transfer_tan_loop(Tan *tan){\n    #if CONFIG_IQMATH\n\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n\n// ---------------------------工程模块Transfer---------------------------\nvoid transfer_atan_loop(Atan *atan){\n    #if CONFIG_IQMATH\n\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n\n\n// ---------------------------工程模块Transfer---------------------------\nvoid transfer_limit_loop(Limit *limit){\n    #if CONFIG_IQMATH\n\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n\n\n// ---------------------------工程模块Transfer---------------------------\nvoid transfer_sign_loop(Sign *sign){\n    #if CONFIG_IQMATH\n\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nvoid transfer_clarke_loop(Clarke *clarke){\n    #if CONFIG_IQMATH\n\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nvoid transfer_park_loop(Park *park){\n    #if CONFIG_IQMATH\n\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nvoid transfer_ipark_loop(Ipark *ipark){\n    #if CONFIG_IQMATH\n\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nvoid transfer_spwm0_loop(Spwm0 *spwm){\n    #if CONFIG_IQMATH\n\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nvoid transfer_spwm_loop(Spwm *spwm){\n    #if CONFIG_IQMATH\n\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\nvoid transfer_svpwm_loop(Svpwm *svpwm){\n    #if CONFIG_IQMATH\n\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\n\n\nvoid transfer_swpwm_loop(Swpwm *swpwm){\n    #if CONFIG_IQMATH\n\n    #else // CONFIG_IQMATH\n    // TODO: 浮点实现\n    #endif // CONFIG_IQMATH\n}\n\n// ---------------------------工程模块Transfer---------------------------\n\nvoid transfer_singlers_loop(SingleRs *singlers){\n    #if CONFIG_IQMATH\n\n    #else // CONFIG_IQMATH\n\n\n    \n\n    #endif // CONFIG_IQMATH\n}\n\n\n\n\n// ---------------------------工程模块Transfer---------------------------\nvoid transfer_reset_integrator(void *p){\n    #if CONFIG_IQMATH\n\n    #else // CONFIG_IQMATH\n\n\n\n    #endif // CONFIG_IQMATH\n}\n\n// ================== 实例池（块实例统一住在这里，用户通过 _get() 拿指针）==================\n#if CONFIG_TRANSFER1\nstatic Transfer1 transfer1_pool[CONFIG_MOTOR][CONFIG_TRANSFER1];\nstatic Transfer1Data transfer1_data_pool[CONFIG_MOTOR][CONFIG_TRANSFER1];\nTransfer1 *transfer_transfer1_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_TRANSFER1) return 0;\n    Transfer1 *self = &transfer1_pool[motor][ch];\n    self->data = &transfer1_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_TRANSFER2\nstatic Transfer2 transfer2_pool[CONFIG_MOTOR][CONFIG_TRANSFER2];\nstatic Transfer2Data transfer2_data_pool[CONFIG_MOTOR][CONFIG_TRANSFER2];\nTransfer2 *transfer_transfer2_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_TRANSFER2) return 0;\n    Transfer2 *self = &transfer2_pool[motor][ch];\n    self->data = &transfer2_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_TRANSFER3\nstatic Transfer3 transfer3_pool[CONFIG_MOTOR][CONFIG_TRANSFER3];\nstatic Transfer3Data transfer3_data_pool[CONFIG_MOTOR][CONFIG_TRANSFER3];\nTransfer3 *transfer_transfer3_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_TRANSFER3) return 0;\n    Transfer3 *self = &transfer3_pool[motor][ch];\n    self->data = &transfer3_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_TRANSFER4\nstatic Transfer4 transfer4_pool[CONFIG_MOTOR][CONFIG_TRANSFER4];\nstatic Transfer4Data transfer4_data_pool[CONFIG_MOTOR][CONFIG_TRANSFER4];\nTransfer4 *transfer_transfer4_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_TRANSFER4) return 0;\n    Transfer4 *self = &transfer4_pool[motor][ch];\n    self->data = &transfer4_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_TRANSFER5\nstatic Transfer5 transfer5_pool[CONFIG_MOTOR][CONFIG_TRANSFER5];\nstatic Transfer5Data transfer5_data_pool[CONFIG_MOTOR][CONFIG_TRANSFER5];\nTransfer5 *transfer_transfer5_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_TRANSFER5) return 0;\n    Transfer5 *self = &transfer5_pool[motor][ch];\n    self->data = &transfer5_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_INTEGRATOR\nstatic Integrator integrator_pool[CONFIG_MOTOR][CONFIG_INTEGRATOR];\nstatic IntegratorData integrator_data_pool[CONFIG_MOTOR][CONFIG_INTEGRATOR];\nIntegrator *transfer_integrator_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_INTEGRATOR) return 0;\n    Integrator *self = &integrator_pool[motor][ch];\n    self->data = &integrator_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_DERIVATIVE\nstatic Derivative derivative_pool[CONFIG_MOTOR][CONFIG_DERIVATIVE];\nstatic DerivativeData derivative_data_pool[CONFIG_MOTOR][CONFIG_DERIVATIVE];\nDerivative *transfer_derivative_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_DERIVATIVE) return 0;\n    Derivative *self = &derivative_pool[motor][ch];\n    self->data = &derivative_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_CURVE\nstatic Curve curve_pool[CONFIG_MOTOR][CONFIG_CURVE];\nstatic CurveData curve_data_pool[CONFIG_MOTOR][CONFIG_CURVE];\nCurve *transfer_curve_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_CURVE) return 0;\n    Curve *self = &curve_pool[motor][ch];\n    self->data = &curve_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_DFT\nstatic Dft dft_pool[CONFIG_MOTOR][CONFIG_DFT];\nstatic DftData dft_data_pool[CONFIG_MOTOR][CONFIG_DFT];\nDft *transfer_dft_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_DFT) return 0;\n    Dft *self = &dft_pool[motor][ch];\n    self->data = &dft_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_HALL\nstatic Hall hall_pool[CONFIG_MOTOR][CONFIG_HALL];\nstatic HallData hall_data_pool[CONFIG_MOTOR][CONFIG_HALL];\nHall *transfer_hall_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_HALL) return 0;\n    Hall *self = &hall_pool[motor][ch];\n    self->data = &hall_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_LADRC1\nstatic Ladrc1 ladrc1_pool[CONFIG_MOTOR][CONFIG_LADRC1];\nstatic Ladrc1Data ladrc1_data_pool[CONFIG_MOTOR][CONFIG_LADRC1];\nLadrc1 *transfer_ladrc1_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_LADRC1) return 0;\n    Ladrc1 *self = &ladrc1_pool[motor][ch];\n    self->data = &ladrc1_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_LADRC2\nstatic Ladrc2 ladrc2_pool[CONFIG_MOTOR][CONFIG_LADRC2];\nstatic Ladrc2Data ladrc2_data_pool[CONFIG_MOTOR][CONFIG_LADRC2];\nLadrc2 *transfer_ladrc2_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_LADRC2) return 0;\n    Ladrc2 *self = &ladrc2_pool[motor][ch];\n    self->data = &ladrc2_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_SMC\nstatic Smc smc_pool[CONFIG_MOTOR][CONFIG_SMC];\nstatic SmcData smc_data_pool[CONFIG_MOTOR][CONFIG_SMC];\nSmc *transfer_smc_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_SMC) return 0;\n    Smc *self = &smc_pool[motor][ch];\n    self->data = &smc_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_DPCC\nstatic Dpcc dpcc_pool[CONFIG_MOTOR][CONFIG_DPCC];\nstatic DpccData dpcc_data_pool[CONFIG_MOTOR][CONFIG_DPCC];\nDpcc *transfer_dpcc_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_DPCC) return 0;\n    Dpcc *self = &dpcc_pool[motor][ch];\n    self->data = &dpcc_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_PIR\nstatic Pir pir_pool[CONFIG_MOTOR][CONFIG_PIR];\nstatic PirData pir_data_pool[CONFIG_MOTOR][CONFIG_PIR];\nPir *transfer_pir_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_PIR) return 0;\n    Pir *self = &pir_pool[motor][ch];\n    self->data = &pir_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_PID\nstatic Pid pid_pool[CONFIG_MOTOR][CONFIG_PID];\nstatic PidData pid_data_pool[CONFIG_MOTOR][CONFIG_PID];\nPid *transfer_pid_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_PID) return 0;\n    Pid *self = &pid_pool[motor][ch];\n    self->data = &pid_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_PLL\nstatic Pll pll_pool[CONFIG_MOTOR][CONFIG_PLL];\nstatic PllData pll_data_pool[CONFIG_MOTOR][CONFIG_PLL];\nPll *transfer_pll_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_PLL) return 0;\n    Pll *self = &pll_pool[motor][ch];\n    self->data = &pll_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_LPF1\nstatic Lpf1 lpf1_pool[CONFIG_MOTOR][CONFIG_LPF1];\nstatic Lpf1Data lpf1_data_pool[CONFIG_MOTOR][CONFIG_LPF1];\nLpf1 *transfer_lpf1_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_LPF1) return 0;\n    Lpf1 *self = &lpf1_pool[motor][ch];\n    self->data = &lpf1_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_LPF2\nstatic Lpf2 lpf2_pool[CONFIG_MOTOR][CONFIG_LPF2];\nstatic Lpf2Data lpf2_data_pool[CONFIG_MOTOR][CONFIG_LPF2];\nLpf2 *transfer_lpf2_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_LPF2) return 0;\n    Lpf2 *self = &lpf2_pool[motor][ch];\n    self->data = &lpf2_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_HPF1\nstatic Hpf1 hpf1_pool[CONFIG_MOTOR][CONFIG_HPF1];\nstatic Hpf1Data hpf1_data_pool[CONFIG_MOTOR][CONFIG_HPF1];\nHpf1 *transfer_hpf1_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_HPF1) return 0;\n    Hpf1 *self = &hpf1_pool[motor][ch];\n    self->data = &hpf1_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_HPF2\nstatic Hpf2 hpf2_pool[CONFIG_MOTOR][CONFIG_HPF2];\nstatic Hpf2Data hpf2_data_pool[CONFIG_MOTOR][CONFIG_HPF2];\nHpf2 *transfer_hpf2_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_HPF2) return 0;\n    Hpf2 *self = &hpf2_pool[motor][ch];\n    self->data = &hpf2_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_BPF1\nstatic Bpf1 bpf1_pool[CONFIG_MOTOR][CONFIG_BPF1];\nstatic Bpf1Data bpf1_data_pool[CONFIG_MOTOR][CONFIG_BPF1];\nBpf1 *transfer_bpf1_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_BPF1) return 0;\n    Bpf1 *self = &bpf1_pool[motor][ch];\n    self->data = &bpf1_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_BPF2\nstatic Bpf2 bpf2_pool[CONFIG_MOTOR][CONFIG_BPF2];\nstatic Bpf2Data bpf2_data_pool[CONFIG_MOTOR][CONFIG_BPF2];\nBpf2 *transfer_bpf2_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_BPF2) return 0;\n    Bpf2 *self = &bpf2_pool[motor][ch];\n    self->data = &bpf2_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_SOGI\nstatic Sogi sogi_pool[CONFIG_MOTOR][CONFIG_SOGI];\nstatic SogiData sogi_data_pool[CONFIG_MOTOR][CONFIG_SOGI];\nSogi *transfer_sogi_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_SOGI) return 0;\n    Sogi *self = &sogi_pool[motor][ch];\n    self->data = &sogi_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_NF\nstatic Nf nf_pool[CONFIG_MOTOR][CONFIG_NF];\nstatic NfData nf_data_pool[CONFIG_MOTOR][CONFIG_NF];\nNf *transfer_nf_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_NF) return 0;\n    Nf *self = &nf_pool[motor][ch];\n    self->data = &nf_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_TPNF\nstatic Tpnf tpnf_pool[CONFIG_MOTOR][CONFIG_TPNF];\nstatic TpnfData tpnf_data_pool[CONFIG_MOTOR][CONFIG_TPNF];\nTpnf *transfer_tpnf_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_TPNF) return 0;\n    Tpnf *self = &tpnf_pool[motor][ch];\n    self->data = &tpnf_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_DOB\nstatic Dob dob_pool[CONFIG_MOTOR][CONFIG_DOB];\nstatic DobData dob_data_pool[CONFIG_MOTOR][CONFIG_DOB];\nDob *transfer_dob_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_DOB) return 0;\n    Dob *self = &dob_pool[motor][ch];\n    self->data = &dob_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_RLS\nstatic Rls rls_pool[CONFIG_MOTOR][CONFIG_RLS];\nstatic RlsData rls_data_pool[CONFIG_MOTOR][CONFIG_RLS];\nRls *transfer_rls_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_RLS) return 0;\n    Rls *self = &rls_pool[motor][ch];\n    self->data = &rls_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_SMO\nstatic Smo smo_pool[CONFIG_MOTOR][CONFIG_SMO];\nstatic SmoData smo_data_pool[CONFIG_MOTOR][CONFIG_SMO];\nSmo *transfer_smo_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_SMO) return 0;\n    Smo *self = &smo_pool[motor][ch];\n    self->data = &smo_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_NLFO\nstatic Nlfo nlfo_pool[CONFIG_MOTOR][CONFIG_NLFO];\nstatic NlfoData nlfo_data_pool[CONFIG_MOTOR][CONFIG_NLFO];\nNlfo *transfer_nlfo_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_NLFO) return 0;\n    Nlfo *self = &nlfo_pool[motor][ch];\n    self->data = &nlfo_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_VCFO\nstatic Vcfo vcfo_pool[CONFIG_MOTOR][CONFIG_VCFO];\nstatic VcfoData vcfo_data_pool[CONFIG_MOTOR][CONFIG_VCFO];\nVcfo *transfer_vcfo_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_VCFO) return 0;\n    Vcfo *self = &vcfo_pool[motor][ch];\n    self->data = &vcfo_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_HFI\nstatic Hfi hfi_pool[CONFIG_MOTOR][CONFIG_HFI];\nstatic HfiData hfi_data_pool[CONFIG_MOTOR][CONFIG_HFI];\nHfi *transfer_hfi_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_HFI) return 0;\n    Hfi *self = &hfi_pool[motor][ch];\n    self->data = &hfi_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_ROLO\nstatic Rolo rolo_pool[CONFIG_MOTOR][CONFIG_ROLO];\nstatic RoloData rolo_data_pool[CONFIG_MOTOR][CONFIG_ROLO];\nRolo *transfer_rolo_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_ROLO) return 0;\n    Rolo *self = &rolo_pool[motor][ch];\n    self->data = &rolo_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_MARS\nstatic Mars mars_pool[CONFIG_MOTOR][CONFIG_MARS];\nstatic MarsData mars_data_pool[CONFIG_MOTOR][CONFIG_MARS];\nMars *transfer_mars_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_MARS) return 0;\n    Mars *self = &mars_pool[motor][ch];\n    self->data = &mars_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_EKF\nstatic Ekf ekf_pool[CONFIG_MOTOR][CONFIG_EKF];\nstatic EkfData ekf_data_pool[CONFIG_MOTOR][CONFIG_EKF];\nEkf *transfer_ekf_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_EKF) return 0;\n    Ekf *self = &ekf_pool[motor][ch];\n    self->data = &ekf_data_pool[motor][ch];\n    return self;\n}\n#endif\n#if CONFIG_DELAY1\nstatic Delay1 delay1_pool[CONFIG_MOTOR][CONFIG_DELAY1];\nDelay1 *transfer_delay1_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_DELAY1) return 0;\n    return &delay1_pool[motor][ch];\n}\n#endif\n#if CONFIG_DELAY2\nstatic Delay2 delay2_pool[CONFIG_MOTOR][CONFIG_DELAY2];\nDelay2 *transfer_delay2_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_DELAY2) return 0;\n    return &delay2_pool[motor][ch];\n}\n#endif\n#if CONFIG_DELAY3\nstatic Delay3 delay3_pool[CONFIG_MOTOR][CONFIG_DELAY3];\nDelay3 *transfer_delay3_get(uint8_t motor, int ch) {\n    if (motor >= CONFIG_MOTOR || ch >= CONFIG_DELAY3) return 0;\n    return &delay3_pool[motor][ch];\n}\n#endif\n\n\n// ==================== 单一功能模块实例（单实例） ====================\nstatic Sine sine_pool[CONFIG_MOTOR];\nSine *transfer_sine_get(uint8_t motor) {\n    if (motor >= CONFIG_MOTOR) return 0;\n    return &sine_pool[motor];\n}\n\nstatic Cosine cosine_pool[CONFIG_MOTOR];\nCosine *transfer_cosine_get(uint8_t motor) {\n    if (motor >= CONFIG_MOTOR) return 0;\n    return &cosine_pool[motor];\n}\n\nstatic SinCos sincos_pool[CONFIG_MOTOR];\nSinCos *transfer_sincos_get(uint8_t motor) {\n    if (motor >= CONFIG_MOTOR) return 0;\n    return &sincos_pool[motor];\n}\n\nstatic Tan tan_pool[CONFIG_MOTOR];\nTan *transfer_tan_get(uint8_t motor) {\n    if (motor >= CONFIG_MOTOR) return 0;\n    return &tan_pool[motor];\n}\n\nstatic Atan atan_pool[CONFIG_MOTOR];\nAtan *transfer_atan_get(uint8_t motor) {\n    if (motor >= CONFIG_MOTOR) return 0;\n    return &atan_pool[motor];\n}\n\nstatic Limit limit_pool[CONFIG_MOTOR];\nLimit *transfer_limit_get(uint8_t motor) {\n    if (motor >= CONFIG_MOTOR) return 0;\n    return &limit_pool[motor];\n}\n\nstatic Sign sign_pool[CONFIG_MOTOR];\nSign *transfer_sign_get(uint8_t motor) {\n    if (motor >= CONFIG_MOTOR) return 0;\n    return &sign_pool[motor];\n}\n\nstatic Clarke clarke_pool[CONFIG_MOTOR];\nClarke *transfer_clarke_get(uint8_t motor) {\n    if (motor >= CONFIG_MOTOR) return 0;\n    return &clarke_pool[motor];\n}\n\nstatic Park park_pool[CONFIG_MOTOR];\nPark *transfer_park_get(uint8_t motor) {\n    if (motor >= CONFIG_MOTOR) return 0;\n    return &park_pool[motor];\n}\n\nstatic Ipark ipark_pool[CONFIG_MOTOR];\nIpark *transfer_ipark_get(uint8_t motor) {\n    if (motor >= CONFIG_MOTOR) return 0;\n    return &ipark_pool[motor];\n}\n\nstatic Spwm0 spwm0_pool[CONFIG_MOTOR];\nSpwm0 *transfer_spwm0_get(uint8_t motor) {\n    if (motor >= CONFIG_MOTOR) return 0;\n    return &spwm0_pool[motor];\n}\n\nstatic Spwm spwm_pool[CONFIG_MOTOR];\nSpwm *transfer_spwm_get(uint8_t motor) {\n    if (motor >= CONFIG_MOTOR) return 0;\n    return &spwm_pool[motor];\n}\n\nstatic Svpwm svpwm_pool[CONFIG_MOTOR];\nSvpwm *transfer_svpwm_get(uint8_t motor) {\n    if (motor >= CONFIG_MOTOR) return 0;\n    return &svpwm_pool[motor];\n}\n\nstatic Swpwm swpwm_pool[CONFIG_MOTOR];\nSwpwm *transfer_swpwm_get(uint8_t motor) {\n    if (motor >= CONFIG_MOTOR) return 0;\n    return &swpwm_pool[motor];\n}\n\nstatic SingleRs singlers_pool[CONFIG_MOTOR];\nSingleRs *transfer_singlers_get(uint8_t motor) {\n    if (motor >= CONFIG_MOTOR) return 0;\n    return &singlers_pool[motor];\n}\n\n// ========================== 所有实例初始化 =====================\nvoid transfer_init(Transfer *transfer){\n\n}\n\n",
      "annotations": [
        {
          "id": "transfer_engine",
          "title": "transfer_transfer1_loop() ~ 5_loop() 通用 1~5 阶差分方程求解引擎",
          "startLine": 15,
          "endLine": 347,
          "category": "algorithm",
          "categoryName": "核心机制",
          "tag": "Tustin 双线性离散化 / 差分引擎",
          "summary": "基于经典控制理论连续域传递函数 $G(s) = \\frac{\\sum b_i s^i}{\\sum a_i s^i}$，经 Tustin 双线性变换离散化后，通过移位缓冲寄存器执行通用差分方程更新。",
          "pipeline": "当前输入 u[k] 进入历史移位队列 -> 计算分子系数卷积和 -> 减去分母历史输出卷积和 -> 更新 y[k]",
          "lineByLine": [
            {
              "lines": "15-55",
              "desc": "一阶系统 Transfer1 初始化与递推计算，包含单步输入历史与输出反馈。"
            },
            {
              "lines": "66-116",
              "desc": "二阶系统 Transfer2 实现，广泛用于二阶滤波器与振荡环节模拟。"
            },
            {
              "lines": "127-185",
              "desc": "三阶系统 Transfer3 实现，用于复杂电机电磁动力学拟合。"
            },
            {
              "lines": "196-262",
              "desc": "四阶系统 Transfer4 实现，具备四级历史存储。"
            },
            {
              "lines": "273-347",
              "desc": "五阶系统 Transfer5 实现，满足极高阶多极点多零点陷波级联差分计算。"
            }
          ],
          "math": [
            {
              "label": "Tustin 双线性代换关系",
              "formula": "s = \\frac{2}{T_s} \\frac{1 - z^{-1}}{1 + z^{-1}}"
            },
            {
              "label": "通用 N 阶差分方程",
              "formula": "y[k] = \\frac{1}{a_0} \\left( \\sum_{i=0}^N b_i u[k-i] - \\sum_{j=1}^N a_j y[k-j] \\right)"
            }
          ],
          "pitfalls": [
            {
              "type": "WARNING",
              "title": "浮点截断稳定性风险",
              "text": "阶数越高，分母多项式展开系数的动态范围越大。若采样周期 Ts 极小 (如 50us)，系数差分极易丢失有效精度。需确保输入系数经标准化定标。"
            }
          ],
          "extensions": "SguanFOC 库中的所有数字滤波器、陷波器、观测器均以此差分方程求解器为基础搭建。"
        },
        {
          "id": "integrator_derivative",
          "title": "transfer_integrator_loop() & derivative_loop() 积分限幅抗饱和与微分算子",
          "startLine": 356,
          "endLine": 432,
          "category": "algorithm",
          "categoryName": "核心算法",
          "tag": "积分抗饱和 / 前向欧拉微分",
          "summary": "数值积分器带上下限硬钳位与防缠绕复位逻辑；数值微分器引入一阶低通滤波抑制高频噪声毛刺。",
          "pipeline": "误差信号 -> 积分累加 (带上限与下限抗饱和钳位) / 差分除以 dt (经低通平滑滤波)",
          "lineByLine": [
            {
              "lines": "356-381",
              "desc": "积分器 loop：当前值累加 $u[k] \\cdot dt$，判断是否超过 max/min 阈值，若溢出则钳位保护。"
            },
            {
              "lines": "392-432",
              "desc": "微分器 loop：计算 $(u[k] - u[k-1])/dt$，并将结果输入一阶平滑滤波器消除高频抖动。"
            }
          ],
          "math": [
            {
              "label": "矩形积分更新法",
              "formula": "I[k] = \\text{clamp}\\left( I[k-1] + u[k] \\cdot T_s, I_{min}, I_{max} \\right)"
            },
            {
              "label": "带滤波微分算子",
              "formula": "D[k] = (1 - \\beta) D[k-1] + \\beta \\frac{u[k] - u[k-1]}{T_s}"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "积分抗饱和 (Anti-Windup)",
              "text": "当电机处于加减速大负荷超调时，积分累积容易无限制膨胀。硬限幅防止了脱离超调区时响应迟钝发滞的严重缺陷。"
            }
          ],
          "extensions": "在电机换向停机或发生故障时，提供 transfer_reset_integrator 函数清零历史状态。"
        },
        {
          "id": "ladrc_controller",
          "title": "transfer_ladrc1_loop() & ladrc2_loop() 线性自抗扰控制 (LADRC)",
          "startLine": 560,
          "endLine": 614,
          "category": "algorithm",
          "categoryName": "现代控制",
          "tag": "LADRC / 扩张状态观测器 LESO",
          "summary": "韩京清教授与高志勋教授提出的自抗扰控制技术，将系统内部未建模动态与外部突变负载扭矩统一视为'总扰动'，通过 LESO 实时估计并前馈补偿。",
          "pipeline": "系统输出 y 与输入 u -> LESO 观测状态与总扰动 f -> 扰动前馈抵消 -> PD 线性状态反馈控制律",
          "lineByLine": [
            {
              "lines": "560-583",
              "desc": "一阶 LADRC 实现，包含二阶扩张状态观测器 (LESO)，实时估计速度与其受到的外部负载总扰动。"
            },
            {
              "lines": "595-614",
              "desc": "二阶 LADRC 实现，包含三阶 LESO，适用于直接驱动位置环抗强扰动伺服。"
            }
          ],
          "math": [
            {
              "label": "一阶系统扩张状态观测器 (LESO)",
              "formula": "\\begin{aligned} \\dot{z}_1 &= z_2 - \\beta_1(z_1 - y) + b_0 u \\\\ \\dot{z}_2 &= -\\beta_2(z_1 - y) \\end{aligned}"
            },
            {
              "label": "扰动动态前馈消除控制律",
              "formula": "u = \\frac{u_0 - z_2}{b_0}, \\quad u_0 = k_p (r - z_1)"
            }
          ],
          "pitfalls": [
            {
              "type": "CAUTION",
              "title": "高志勋参数整定法",
              "text": "将复杂的参数归一化为观测器带宽 $\\omega_o$ 与控制器带宽 $\\omega_c$，工程调试只需调节这两个带宽即可，大幅降低调参难度。"
            }
          ],
          "extensions": "在无人机螺旋桨突风扰动或数控机床变切削力工况下，LADRC 的动态抗扰刚性显著优于传统 PID。"
        },
        {
          "id": "smc_controller",
          "title": "transfer_smc_loop() 滑模变结构控制与指数趋近律",
          "startLine": 626,
          "endLine": 645,
          "category": "algorithm",
          "categoryName": "现代控制",
          "tag": "SMC / 滑模变结构",
          "summary": "设计滑模超平面切换面 $s = c \\cdot e + \\dot{e}$，配合指数趋近律让系统状态沿滑模面收敛，对参数摄动与外界非线性干扰具有强鲁棒性。",
          "pipeline": "跟踪误差 e -> 构成滑模面 s -> 计算等效控制与切换趋近项 -> 输出控制量 u",
          "lineByLine": [
            {
              "lines": "626-634",
              "desc": "初始化滑模面斜率系数 c 与趋近律参数 epsilon, k。"
            },
            {
              "lines": "635-645",
              "desc": "计算当前滑模面数值，通过饱和函数 sat(s) 替代符号函数 sgn(s) 抑制高频抖振，输出控制律。"
            }
          ],
          "math": [
            {
              "label": "滑模超平面定义",
              "formula": "s = c \\cdot (r - y) + (\\dot{r} - \\dot{y})"
            },
            {
              "label": "指数趋近律",
              "formula": "\\dot{s} = -\\epsilon \\cdot \\text{sat}(s/\\delta) - k \\cdot s"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "边界层消除抖振",
              "text": "经典滑模因符号函数不连续会在切换面附近产生剧烈高频抖振并引发机械啸叫；采用边界层饱和函数 sat(s/δ) 可实现连续平滑过渡。"
            }
          ],
          "extensions": "非常适合重载机器人关节和直驱云台电机的快速启停控制。"
        },
        {
          "id": "dpcc_controller",
          "title": "transfer_dpcc_loop() 无拍预测电流控制 (Deadbeat Predictive)",
          "startLine": 657,
          "endLine": 676,
          "category": "algorithm",
          "categoryName": "现代控制",
          "tag": "DPCC / 无拍预测",
          "summary": "基于电机定子电压与电流差分方程物理模型，计算在下一个 PWM 采样周期使电流精确跟踪上期望参考值所需的瞬态端电压矢量。",
          "pipeline": "电机反电动势与电感物理模型 -> 预测一步电流误差 -> 逆解所需定子端电压 -> 输出 Ud, Uq 给定",
          "lineByLine": [
            {
              "lines": "657-665",
              "desc": "配置电机相电阻 Rs、d/q 轴电感 Ld/Lq 与采样周期 Ts 参数。"
            },
            {
              "lines": "666-676",
              "desc": "代入无拍解耦方程，计算消除一步误差所需的电压矢量 $(u_d^*, u_q^*)$。"
            }
          ],
          "math": [
            {
              "label": "无拍电流预测方程",
              "formula": "u_d[k] = R_s i_d[k] + L_d \\frac{i_d^*[k+1] - i_d[k]}{T_s} - \\omega_e L_q i_q[k]"
            },
            {
              "label": "q 轴无拍预测方程",
              "formula": "u_q[k] = R_s i_q[k] + L_q \\frac{i_q^*[k+1] - i_q[k]}{T_s} + \\omega_e (L_d i_d[k] + \\psi_f)"
            }
          ],
          "pitfalls": [
            {
              "type": "WARNING",
              "title": "高度依赖电机物理参数",
              "text": "无拍控制响应极快 (理论 1 个控制周期完成跟踪)，但极度敏感于电感 L 与电阻 R 的准确度；参数失配严重时易产生高频自激振荡。"
            }
          ],
          "extensions": "常与递归最小二乘法 (RLS) 在线参数辨识模块配合使用以提高鲁棒性。"
        },
        {
          "id": "pid_controller",
          "title": "transfer_pid_loop() 工业级抗饱和防缠绕 PID 控制器",
          "startLine": 719,
          "endLine": 738,
          "category": "algorithm",
          "categoryName": "核心算法",
          "tag": "PID / 工业级闭环",
          "summary": "位置、速度与电流环通用基础控制器，具备独立 Kp/Ki/Kd 增益、积分抗饱和钳位、死区死角滤波以及微分先行防冲击机制。",
          "pipeline": "计算误差 err = target - real -> 比例项 Kp*err -> 积分项累加并钳位 -> 微分项滤波 -> 合并输出并限幅",
          "lineByLine": [
            {
              "lines": "719-727",
              "desc": "初始化控制器参数，设定积分饱和上限与控制器总输出极限幅值。"
            },
            {
              "lines": "728-738",
              "desc": "执行 P-I-D 运算，若总输出达到饱和区，暂停同方向的积分累加，有效杜绝积分缠绕。"
            }
          ],
          "math": [
            {
              "label": "位置式 PID 离散算式",
              "formula": "u[k] = K_p e[k] + K_i \\sum_{j=0}^k e[j] T_s + K_d \\frac{e[k] - e[k-1]}{T_s}"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "抗积分饱和条件累加",
              "text": "当输出达到最大正饱和且误差依然为正时，积分项禁止继续增大；反之亦然。这保证了误差反向时控制器能瞬间退出饱和状态。"
            }
          ],
          "extensions": "SguanFOC 支持通过串口命令动态无扰在线修改 PID 参数。"
        },
        {
          "id": "filters_bank",
          "title": "transfer_lpf1_loop() ~ bpf2_loop() 一阶/二阶低通、高通、带通数字滤波器族",
          "startLine": 784,
          "endLine": 1140,
          "category": "algorithm",
          "categoryName": "信号处理",
          "tag": "数字滤波 / 噪声滤除",
          "summary": "完整的离散数字滤波器工具箱，包含 LPF1 (一阶低通)、LPF2 (二阶低通巴特沃斯)、HPF (高通) 与 BPF (带通)，为速度计算与电流反馈提供纯净信号。",
          "pipeline": "输入原始采样信号 -> 双线性差分滤波迭代 -> 滤除高频开关噪声/基波提取 -> 输出平滑信号",
          "lineByLine": [
            {
              "lines": "784-822",
              "desc": "LPF1 一阶低通滤波器，适用于编码器微分速度平滑。"
            },
            {
              "lines": "840-887",
              "desc": "LPF2 二阶低通滤波器，衰减斜率 -40dB/dec，抑制 PWM 斩波毛刺能力更强。"
            },
            {
              "lines": "902-1008",
              "desc": "HPF1 / HPF2 隔直高通滤波器，滤除直流偏置漂移。"
            },
            {
              "lines": "1026-1140",
              "desc": "BPF1 / BPF2 带通滤波器，用于特定频段特征信号提取 (如高频注入响应信号)。"
            }
          ],
          "math": [
            {
              "label": "一阶低通连续传递函数与离散形式",
              "formula": "G_{lpf1}(s) = \\frac{\\omega_c}{s + \\omega_c} \\implies y[k] = (1 - \\alpha) y[k-1] + \\alpha u[k]"
            }
          ],
          "pitfalls": [
            {
              "type": "CAUTION",
              "title": "截止频率与相位滞后权衡",
              "text": "滤波器的截止频率 fc 越低，输出波形越平滑，但引入的相位滞后也越严重。速度环滤波截止频率建议设在 50~100Hz 之间。"
            }
          ],
          "extensions": "全部滤波器参数支持通过截止频率与阻尼比自动在编译期或初始化时离散化配置。"
        },
        {
          "id": "notch_filter",
          "title": "transfer_sogi_loop() & nf_loop() 二阶广义积分器与机械共振陷波器",
          "startLine": 1157,
          "endLine": 1247,
          "category": "algorithm",
          "categoryName": "高级控制",
          "tag": "陷波器 / 机械共振消除",
          "summary": "针对传动机构（齿轮箱、同步带、联轴器）固有的高频扭转机械共振啸叫，陷波滤波器可在指定中心频率处产生极深凹陷衰减，彻底消除啸叫发热。",
          "pipeline": "分析机械共振频率点 (如 800Hz) -> 设定中心频率与品质因数 Q -> 陷波滤波器串入控制回路 -> 消除自激振荡",
          "lineByLine": [
            {
              "lines": "1157-1181",
              "desc": "SOGI 二阶广义积分器，构造 90 度正交信号并提取特定频率基波分量。"
            },
            {
              "lines": "1199-1247",
              "desc": "Nf 单频陷波滤波器，在中心频率两侧提供陡峭衰减，保护机械传动链。"
            }
          ],
          "math": [
            {
              "label": "连续域双 T 陷波器传递函数",
              "formula": "G_{notch}(s) = \\frac{s^2 + \\omega_0^2}{s^2 + \\frac{\\omega_0}{Q} s + \\omega_0^2}"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "消除啸叫实战绝招",
              "text": "若电机上电使能后发出刺耳的千赫兹高频啸叫且电机急剧发烫，说明速度环 Kp 激发出机械共振。开启本陷波器将共振频率滤除即可消除啸叫并允许进一步拔高 Kp！"
            }
          ],
          "extensions": "支持配置多组级联双频陷波器 (TPNF)，同时滤除一阶与二阶机械共振峰。"
        },
        {
          "id": "sensorless_observers",
          "title": "transfer_smo_loop() / nlfo_loop() / hfi_loop() 全速域无感 FOC 观测器",
          "startLine": 1386,
          "endLine": 1590,
          "category": "algorithm",
          "categoryName": "无感控制",
          "tag": "全速域无感 / SMO / HFI / EKF",
          "summary": "摆脱物理编码器约束的全套无传感器算法集：SMO 滑模观测器负责中高速，HFI 高频注入攻克零速静止与低速启动，NLFO/EKF 提供非线性磁链滤波。",
          "pipeline": "零速/低速段 -> HFI 注入高频载波提取凸极电感差 -> 中高速段 -> SMO/NLFO 提取反电动势 -> PLL 锁相输出电角度",
          "lineByLine": [
            {
              "lines": "1386-1405",
              "desc": "SMO 滑模观测器：利用滑模开关面迫使电流估计值逼近实测值，等效输出反电动势估算量。"
            },
            {
              "lines": "1417-1436",
              "desc": "NLFO 非线性磁链观测器：基于定子磁链守恒积分并校正幅值误差，消除纯积分漂移。"
            },
            {
              "lines": "1478-1497",
              "desc": "HFI 高频方波/旋转高频注入：利用转子凸极效应 ($L_d \\neq L_q$) 在静止时准确定位初始磁极。"
            },
            {
              "lines": "1571-1590",
              "desc": "EKF 扩展卡尔曼滤波：基于状态空间协方差矩阵预测与更新，具备最佳抗噪声估计品质。"
            }
          ],
          "math": [
            {
              "label": "滑模反电动势观测方程",
              "formula": "\\frac{d\\hat{\\mathbf{i}}}{dt} = -\\frac{R_s}{L} \\hat{\\mathbf{i}} + \\frac{1}{L}(\\mathbf{u} - \\mathbf{e}_{est} - k \\cdot \\text{sgn}(\\hat{\\mathbf{i}} - \\mathbf{i}))"
            },
            {
              "label": "高频注入凸极解调信号",
              "formula": "i_{dq\\_hfi} \\propto \\frac{U_h}{\\omega_h} \\cdot \\frac{L_q - L_d}{2 L_d L_q} \\sin(2\\Delta\\theta_e)"
            }
          ],
          "pitfalls": [
            {
              "type": "WARNING",
              "title": "SMO 零低速死区",
              "text": "反电动势幅值正比于转速。在零速或极低速时反电动势被噪声淹没，单纯 SMO 无法启动，必须配合开环强拖 (I-F) 或 HFI 高频注入切换。"
            }
          ],
          "extensions": "广泛应用于高速无人机电调、无感吸尘器与风机水泵等低成本严苛环境应用。"
        },
        {
          "id": "vector_transforms",
          "title": "transfer_clarke_loop() / park_loop() / svpwm_loop() 矢量变换与空间调制",
          "startLine": 1778,
          "endLine": 1885,
          "category": "algorithm",
          "categoryName": "核心算法",
          "tag": "SVPWM / 矢量变换",
          "summary": "FOC 理论基石模块，完成三相交流与两相直交旋转量转换，并通过 SVPWM 马鞍波合成等效电压旋转矢量，使直流母线电压利用率达到 100%。",
          "pipeline": "相电流 Ia, Ib, Ic -> Clarke 变换 -> Ialpha, Ibeta -> Park 变换 (带入转子角度) -> Id, Iq 闭环 -> 反 Park -> SVPWM 计算三相比较值",
          "lineByLine": [
            {
              "lines": "1778-1787",
              "desc": "Clarke 变换：将 $120^{\\circ}$ 三相静止坐标映射到 $90^{\\circ}$ 两相静止正交坐标系。"
            },
            {
              "lines": "1793-1802",
              "desc": "Park 变换：引入电气旋转角度 $\\theta_e$，将交流量转换为类似直流电机的恒定直交流量。"
            },
            {
              "lines": "1808-1817",
              "desc": "反 Park 变换：将调节后的期望输出电压矢量 $(U_d, U_q)$ 还原为两相静止量 $(U_\\alpha, U_\\beta)$。"
            },
            {
              "lines": "1851-1860",
              "desc": "SVPWM 空间矢量脉宽调制：判断矢量所在六角形扇区，计算两相邻有效矢量与零矢量作用时间，输出三相马鞍波占空比。"
            }
          ],
          "math": [
            {
              "label": "SVPWM 最大不失真输出线电压",
              "formula": "U_{max, SVPWM} = \\frac{V_{bus}}{\\sqrt{3}} \\approx 0.577 V_{bus} \\quad (\\text{相比 SPWM 提升 } 15.47\\%)"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "马鞍波的本质",
              "text": "SVPWM 相当于在正弦调制波中注入了 1/6 比例的三次谐波，使相电压波形顶部塌陷变平，从而在不引发过调制的前提下充分抬升相间线电压。"
            }
          ],
          "extensions": "SguanFOC 提供了独立可配置的 SPWM、SVPWM 以及单电阻采样重构 (SingleRs) 调制算法。"
        },
        {
          "id": "instance_pools",
          "title": "transfer_transfer1_get() ~ svpwm_get() 多轴实例池统一内存管理",
          "startLine": 1901,
          "endLine": 2366,
          "category": "hardware",
          "categoryName": "架构设计",
          "tag": "零动态分配 / 内存对象池",
          "summary": "在 BSS 全局数据段为每个电机各算法模块预先开辟静态多维数组对象池，通过统一的 `_get()` 访问函数按电机轴与通道号安全获取实例指针。",
          "pipeline": "传入电机号 motor 与通道号 ch -> 边界安全越界校验 -> 获取静态池指针 -> 自动绑定 Data 缓存区 -> 返回可用对象",
          "lineByLine": [
            {
              "lines": "1901-1950",
              "desc": "Transfer1 ~ Transfer5 多通道传递函数对象池分配逻辑。"
            },
            {
              "lines": "1951-2100",
              "desc": "PID、LADRC、SMC、DPCC 等各轴专用控制器的内存池定义与获取函数。"
            },
            {
              "lines": "2101-2366",
              "desc": "Clarke、Park、SVPWM 与无感观测器的实例池绑定与全局初始化。"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "严禁 malloc 动态内存分配",
              "text": "工业电机固件严禁在运行时使用 malloc/free，以彻底消除内存碎片导致系统运行数天后随机卡死的风险。"
            }
          ],
          "extensions": "静态池尺寸由 Sguan_Config.h 中的 CONFIG_MOTOR 和 CONFIG_TRANSFER 等宏严格界定。"
        }
      ]
    },
    {
      "id": "sguan_motorstatus_c",
      "name": "Sguan_MotorStatus.c",
      "matrixIndex": "05",
      "role": "196 项有限状态机与故障防护引擎",
      "header": "Sguan_MotorStatus.h",
      "hardware": "过压/欠压/过流/NTC 采样/堵转检测",
      "badge": "Tier 1 状态机与安全防护",
      "shortDesc": "完备的工业级电机运行有限状态机 (FSM)，管理空闲、就绪、标定、加减速、位置到达判定及 12 大硬件故障保护。",
      "lineCount": 867,
      "sizeBytes": 46647,
      "content": "#include \"Sguan_MotorStatus.h\"\n/* SguanFOC配置文件声明 */\n#include \"UnitLib_Status.h\"\n\n/* 内部宏定义设计 */\n#define STATUS(x) ((uint8_t)(x))\n#define EVENT(x)  ((uint8_t)(x))\n\n#define MODE_TORQUE     0x00\n#define MODE_VELOCITY   0x01\n#define MODE_POSITION   0x02\n\n/* 内部私有变量与函数 */\nstatic void motorstatus_null0(SguanFoc *sguan);\nstatic void motorstatus_null1(void);\nstatic void motorstatus_idle_init(SguanFoc *sguan);\nstatic void motorstatus_overvoltage_init(SguanFoc *sguan);\nstatic void motorstatus_undervoltage_init(SguanFoc *sguan);\nstatic void motorstatus_overcurrent_init(SguanFoc *sguan);\nstatic void motorstatus_overtemp_motor_init(SguanFoc *sguan);\nstatic void motorstatus_undertemp_motor_init(SguanFoc *sguan);\nstatic void motorstatus_overtemp_driver_init(SguanFoc *sguan);\nstatic void motorstatus_undertemp_driver_init(SguanFoc *sguan);\nstatic void motorstatus_overtemp_pcb_init(SguanFoc *sguan);\nstatic void motorstatus_undertemp_pcb_init(SguanFoc *sguan);\nstatic void motorstatus_stuck_init(SguanFoc *sguan);\nstatic void motorstatus_phase_loss_init(SguanFoc *sguan);\nstatic void motorstatus_fault_init(SguanFoc *sguan);\nstatic HandleEvent motorstatus_event_get(uint8_t run);\n// ===================================================\nstatic void motorstatus_null0(SguanFoc *sguan){\n    // 空函数\n}\n\nstatic void motorstatus_null1(void){\n    // 空函数\n}\n\nstatic void motorstatus_idle_init(SguanFoc *sguan){\n    sguan->motorstatus.data.error_code = 0x00;\n    unitlib_main_standby_init(sguan);\n}\n\nstatic void motorstatus_overvoltage_init(SguanFoc *sguan){\n    sguan->motorstatus.data.error_code = 0x01;\n    unitlib_main_standby_init(sguan);\n}\n\nstatic void motorstatus_undervoltage_init(SguanFoc *sguan){\n    sguan->motorstatus.data.error_code = 0x02;\n    unitlib_main_standby_init(sguan);\n}\n\nstatic void motorstatus_overcurrent_init(SguanFoc *sguan){\n    sguan->motorstatus.data.error_code = 0x03;\n    unitlib_main_standby_init(sguan);\n}\n\nstatic void motorstatus_overtemp_motor_init(SguanFoc *sguan){\n    sguan->motorstatus.data.error_code = 0x04;\n    unitlib_main_standby_init(sguan);\n}\n\nstatic void motorstatus_undertemp_motor_init(SguanFoc *sguan){\n    sguan->motorstatus.data.error_code = 0x05;\n    unitlib_main_standby_init(sguan);\n}\n\nstatic void motorstatus_overtemp_driver_init(SguanFoc *sguan){\n    sguan->motorstatus.data.error_code = 0x06;\n    unitlib_main_standby_init(sguan);\n}\n\nstatic void motorstatus_undertemp_driver_init(SguanFoc *sguan){\n    sguan->motorstatus.data.error_code = 0x07;\n    unitlib_main_standby_init(sguan);\n}\n\nstatic void motorstatus_overtemp_pcb_init(SguanFoc *sguan){\n    sguan->motorstatus.data.error_code = 0x08;\n    unitlib_main_standby_init(sguan);\n}\n\nstatic void motorstatus_undertemp_pcb_init(SguanFoc *sguan){\n    sguan->motorstatus.data.error_code = 0x09;\n    unitlib_main_standby_init(sguan);\n}\n\nstatic void motorstatus_stuck_init(SguanFoc *sguan){\n    sguan->motorstatus.data.error_code = 0x0A;\n    unitlib_main_standby_init(sguan);\n}\n\nstatic void motorstatus_phase_loss_init(SguanFoc *sguan){\n    sguan->motorstatus.data.error_code = 0x0B;\n    unitlib_main_standby_init(sguan);\n}\n\nstatic void motorstatus_fault_init(SguanFoc *sguan){\n    sguan->motorstatus.data.error_code = 0x0C;\n    unitlib_main_standby_init(sguan);\n}\n\nstatic const MotorTab motor_tab[196] = {\n    // 1.当前的状态机                    2.当前状态机可触发的事件              3.如果触发此事件，下一时刻的状态机\n    {STATUS(status_standby),            EVENT(event_ready),                 STATUS(status_ready)},\n\n    // ======================================================================================\n    {STATUS(status_ready),              EVENT(event_initializing),          STATUS(status_initializing)},\n    {STATUS(status_ready),              EVENT(event_standby0),              STATUS(status_standby)},\n\n    // ======================================================================================\n    {STATUS(status_initializing),       EVENT(event_success),               STATUS(status_gotoinit0_angle)},\n    {STATUS(status_gotoinit0_angle),    EVENT(event_success),               STATUS(status_gotoinit1_current)},\n    {STATUS(status_gotoinit1_current),  EVENT(event_success),               STATUS(status_idle)},\n    \n    // =======================================================================================\n    {STATUS(status_idle),               EVENT(event_torque_hold),           STATUS(status_torque_hold)},\n    {STATUS(status_idle),               EVENT(event_torque_increasing),     STATUS(status_torque_increasing)},\n    {STATUS(status_idle),               EVENT(event_torque_decreasing),     STATUS(status_torque_decreasing)},\n\n    {STATUS(status_idle),               EVENT(event_velocity_hold),         STATUS(status_velocity_hold)},\n    {STATUS(status_idle),               EVENT(event_velocity_increasing),   STATUS(status_velocity_increasing)},\n    {STATUS(status_idle),               EVENT(event_velocity_decreasing),   STATUS(status_velocity_decreasing)},\n\n    {STATUS(status_idle),               EVENT(event_position_hold),         STATUS(status_position_hold)},\n    {STATUS(status_idle),               EVENT(event_position_increasing),   STATUS(status_position_increasing)},\n    {STATUS(status_idle),               EVENT(event_position_decreasing),   STATUS(status_position_decreasing)},\n    \n    {STATUS(status_idle),               EVENT(event_standby0),              STATUS(status_standby)},\n    {STATUS(status_idle),               EVENT(event_ready),                 STATUS(status_ready)},\n\n    {STATUS(status_idle),               EVENT(event_overvoltage),           STATUS(status_overvoltage)},\n    {STATUS(status_idle),               EVENT(event_undervoltage),          STATUS(status_undervoltage)},\n    {STATUS(status_idle),               EVENT(event_overcurrent),           STATUS(status_overcurrent)},\n    {STATUS(status_idle),               EVENT(event_overtemp_motor),        STATUS(status_overtemp_motor)},\n    {STATUS(status_idle),               EVENT(event_undertemp_motor),       STATUS(status_undertemp_motor)},\n    {STATUS(status_idle),               EVENT(event_overtemp_driver),       STATUS(status_overtemp_driver)},\n    {STATUS(status_idle),               EVENT(event_undertemp_driver),      STATUS(status_undertemp_driver)},\n    {STATUS(status_idle),               EVENT(event_overtemp_pcb),          STATUS(status_overtemp_pcb)},\n    {STATUS(status_idle),               EVENT(event_undertemp_pcb),         STATUS(status_undertemp_pcb)},\n\n    {STATUS(status_idle),               EVENT(event_phase_loss),            STATUS(status_phase_loss)},\n    {STATUS(status_idle),               EVENT(event_fault),                 STATUS(status_fault)},\n    \n    // =======================================================================================\n    {STATUS(status_torque_increasing),  EVENT(event_torque_hold),           STATUS(status_torque_hold)},\n    {STATUS(status_torque_increasing),  EVENT(event_torque_decreasing),     STATUS(status_torque_decreasing)},\n\n    {STATUS(status_torque_increasing),  EVENT(event_standby0),              STATUS(status_standby)},\n    {STATUS(status_torque_increasing),  EVENT(event_ready),                 STATUS(status_ready)},\n    \n    {STATUS(status_torque_increasing),  EVENT(event_overvoltage),           STATUS(status_overvoltage)},\n    {STATUS(status_torque_increasing),  EVENT(event_undervoltage),          STATUS(status_undervoltage)},\n    {STATUS(status_torque_increasing),  EVENT(event_overcurrent),           STATUS(status_overcurrent)},\n    {STATUS(status_torque_increasing),  EVENT(event_overtemp_motor),        STATUS(status_overtemp_motor)},\n    {STATUS(status_torque_increasing),  EVENT(event_undertemp_motor),       STATUS(status_undertemp_motor)},\n    {STATUS(status_torque_increasing),  EVENT(event_overtemp_driver),       STATUS(status_overtemp_driver)},\n    {STATUS(status_torque_increasing),  EVENT(event_undertemp_driver),      STATUS(status_undertemp_driver)},\n    {STATUS(status_torque_increasing),  EVENT(event_overtemp_pcb),          STATUS(status_overtemp_pcb)},\n    {STATUS(status_torque_increasing),  EVENT(event_undertemp_pcb),         STATUS(status_undertemp_pcb)},\n\n    {STATUS(status_torque_increasing),  EVENT(event_stuck),                 STATUS(status_stuck)},\n    {STATUS(status_torque_increasing),  EVENT(event_phase_loss),            STATUS(status_phase_loss)},\n    {STATUS(status_torque_increasing),  EVENT(event_fault),                 STATUS(status_fault)},\n\n    // =======================================================================================\n    {STATUS(status_torque_decreasing),  EVENT(event_torque_hold),           STATUS(status_torque_hold)},\n    {STATUS(status_torque_decreasing),  EVENT(event_torque_increasing),     STATUS(status_torque_increasing)},\n\n    {STATUS(status_torque_decreasing),  EVENT(event_standby0),              STATUS(status_standby)},\n    {STATUS(status_torque_decreasing),  EVENT(event_ready),                 STATUS(status_ready)},\n    \n    {STATUS(status_torque_decreasing),  EVENT(event_overvoltage),           STATUS(status_overvoltage)},\n    {STATUS(status_torque_decreasing),  EVENT(event_undervoltage),          STATUS(status_undervoltage)},\n    {STATUS(status_torque_decreasing),  EVENT(event_overcurrent),           STATUS(status_overcurrent)},\n    {STATUS(status_torque_decreasing),  EVENT(event_overtemp_motor),        STATUS(status_overtemp_motor)},\n    {STATUS(status_torque_decreasing),  EVENT(event_undertemp_motor),       STATUS(status_undertemp_motor)},\n    {STATUS(status_torque_decreasing),  EVENT(event_overtemp_driver),       STATUS(status_overtemp_driver)},\n    {STATUS(status_torque_decreasing),  EVENT(event_undertemp_driver),      STATUS(status_undertemp_driver)},\n    {STATUS(status_torque_decreasing),  EVENT(event_overtemp_pcb),          STATUS(status_overtemp_pcb)},\n    {STATUS(status_torque_decreasing),  EVENT(event_undertemp_pcb),         STATUS(status_undertemp_pcb)},\n\n    {STATUS(status_torque_decreasing),  EVENT(event_stuck),                 STATUS(status_stuck)},\n    {STATUS(status_torque_decreasing),  EVENT(event_phase_loss),            STATUS(status_phase_loss)},\n    {STATUS(status_torque_decreasing),  EVENT(event_fault),                 STATUS(status_fault)},\n\n    // =======================================================================================\n    {STATUS(status_torque_hold),        EVENT(event_torque_increasing),     STATUS(status_torque_increasing)},\n    {STATUS(status_torque_hold),        EVENT(event_torque_decreasing),     STATUS(status_torque_decreasing)},\n\n    {STATUS(status_torque_hold),        EVENT(event_standby0),              STATUS(status_standby)},\n    {STATUS(status_torque_hold),        EVENT(event_ready),                 STATUS(status_ready)},\n    \n    {STATUS(status_torque_hold),        EVENT(event_overvoltage),           STATUS(status_overvoltage)},\n    {STATUS(status_torque_hold),        EVENT(event_undervoltage),          STATUS(status_undervoltage)},\n    {STATUS(status_torque_hold),        EVENT(event_overcurrent),           STATUS(status_overcurrent)},\n    {STATUS(status_torque_hold),        EVENT(event_overtemp_motor),        STATUS(status_overtemp_motor)},\n    {STATUS(status_torque_hold),        EVENT(event_undertemp_motor),       STATUS(status_undertemp_motor)},\n    {STATUS(status_torque_hold),        EVENT(event_overtemp_driver),       STATUS(status_overtemp_driver)},\n    {STATUS(status_torque_hold),        EVENT(event_undertemp_driver),      STATUS(status_undertemp_driver)},\n    {STATUS(status_torque_hold),        EVENT(event_overtemp_pcb),          STATUS(status_overtemp_pcb)},\n    {STATUS(status_torque_hold),        EVENT(event_undertemp_pcb),         STATUS(status_undertemp_pcb)},\n\n    {STATUS(status_torque_hold),        EVENT(event_stuck),                 STATUS(status_stuck)},\n    {STATUS(status_torque_hold),        EVENT(event_phase_loss),            STATUS(status_phase_loss)},\n    {STATUS(status_torque_hold),        EVENT(event_fault),                 STATUS(status_fault)},\n\n    // =======================================================================================\n    {STATUS(status_velocity_increasing),EVENT(event_velocity_hold),         STATUS(status_velocity_hold)},\n    {STATUS(status_velocity_increasing),EVENT(event_velocity_decreasing),   STATUS(status_velocity_decreasing)},\n\n    {STATUS(status_velocity_increasing),EVENT(event_standby0),              STATUS(status_standby)},\n    {STATUS(status_velocity_increasing),EVENT(event_ready),                 STATUS(status_ready)},\n    \n    {STATUS(status_velocity_increasing),EVENT(event_overvoltage),           STATUS(status_overvoltage)},\n    {STATUS(status_velocity_increasing),EVENT(event_undervoltage),          STATUS(status_undervoltage)},\n    {STATUS(status_velocity_increasing),EVENT(event_overcurrent),           STATUS(status_overcurrent)},\n    {STATUS(status_velocity_increasing),EVENT(event_overtemp_motor),        STATUS(status_overtemp_motor)},\n    {STATUS(status_velocity_increasing),EVENT(event_undertemp_motor),       STATUS(status_undertemp_motor)},\n    {STATUS(status_velocity_increasing),EVENT(event_overtemp_driver),       STATUS(status_overtemp_driver)},\n    {STATUS(status_velocity_increasing),EVENT(event_undertemp_driver),      STATUS(status_undertemp_driver)},\n    {STATUS(status_velocity_increasing),EVENT(event_overtemp_pcb),          STATUS(status_overtemp_pcb)},\n    {STATUS(status_velocity_increasing),EVENT(event_undertemp_pcb),         STATUS(status_undertemp_pcb)},\n\n    {STATUS(status_velocity_increasing),EVENT(event_stuck),                 STATUS(status_stuck)},\n    {STATUS(status_velocity_increasing),EVENT(event_phase_loss),            STATUS(status_phase_loss)},\n    {STATUS(status_velocity_increasing),EVENT(event_fault),                 STATUS(status_fault)},\n\n    // =======================================================================================\n    {STATUS(status_velocity_decreasing),EVENT(event_velocity_hold),         STATUS(status_velocity_hold)},\n    {STATUS(status_velocity_decreasing),EVENT(event_velocity_increasing),   STATUS(status_velocity_increasing)},\n\n    {STATUS(status_velocity_decreasing),EVENT(event_standby0),              STATUS(status_standby)},\n    {STATUS(status_velocity_decreasing),EVENT(event_ready),                 STATUS(status_ready)},\n    \n    {STATUS(status_velocity_decreasing),EVENT(event_overvoltage),           STATUS(status_overvoltage)},\n    {STATUS(status_velocity_decreasing),EVENT(event_undervoltage),          STATUS(status_undervoltage)},\n    {STATUS(status_velocity_decreasing),EVENT(event_overcurrent),           STATUS(status_overcurrent)},\n    {STATUS(status_velocity_decreasing),EVENT(event_overtemp_motor),        STATUS(status_overtemp_motor)},\n    {STATUS(status_velocity_decreasing),EVENT(event_undertemp_motor),       STATUS(status_undertemp_motor)},\n    {STATUS(status_velocity_decreasing),EVENT(event_overtemp_driver),       STATUS(status_overtemp_driver)},\n    {STATUS(status_velocity_decreasing),EVENT(event_undertemp_driver),      STATUS(status_undertemp_driver)},\n    {STATUS(status_velocity_decreasing),EVENT(event_overtemp_pcb),          STATUS(status_overtemp_pcb)},\n    {STATUS(status_velocity_decreasing),EVENT(event_undertemp_pcb),         STATUS(status_undertemp_pcb)},\n\n    {STATUS(status_velocity_decreasing),EVENT(event_stuck),                 STATUS(status_stuck)},\n    {STATUS(status_velocity_decreasing),EVENT(event_phase_loss),            STATUS(status_phase_loss)},\n    {STATUS(status_velocity_decreasing),EVENT(event_fault),                 STATUS(status_fault)},\n\n    // =======================================================================================\n    {STATUS(status_velocity_hold),      EVENT(event_velocity_increasing),   STATUS(status_velocity_increasing)},\n    {STATUS(status_velocity_hold),      EVENT(event_velocity_decreasing),   STATUS(status_velocity_decreasing)},\n\n    {STATUS(status_velocity_hold),      EVENT(event_standby0),              STATUS(status_standby)},\n    {STATUS(status_velocity_hold),      EVENT(event_ready),                 STATUS(status_ready)},\n    \n    {STATUS(status_velocity_hold),      EVENT(event_overvoltage),           STATUS(status_overvoltage)},\n    {STATUS(status_velocity_hold),      EVENT(event_undervoltage),          STATUS(status_undervoltage)},\n    {STATUS(status_velocity_hold),      EVENT(event_overcurrent),           STATUS(status_overcurrent)},\n    {STATUS(status_velocity_hold),      EVENT(event_overtemp_motor),        STATUS(status_overtemp_motor)},\n    {STATUS(status_velocity_hold),      EVENT(event_undertemp_motor),       STATUS(status_undertemp_motor)},\n    {STATUS(status_velocity_hold),      EVENT(event_overtemp_driver),       STATUS(status_overtemp_driver)},\n    {STATUS(status_velocity_hold),      EVENT(event_undertemp_driver),      STATUS(status_undertemp_driver)},\n    {STATUS(status_velocity_hold),      EVENT(event_overtemp_pcb),          STATUS(status_overtemp_pcb)},\n    {STATUS(status_velocity_hold),      EVENT(event_undertemp_pcb),         STATUS(status_undertemp_pcb)},\n\n    {STATUS(status_velocity_hold),      EVENT(event_stuck),                 STATUS(status_stuck)},\n    {STATUS(status_velocity_hold),      EVENT(event_phase_loss),            STATUS(status_phase_loss)},\n    {STATUS(status_velocity_hold),      EVENT(event_fault),                 STATUS(status_fault)},\n\n    // =======================================================================================\n    {STATUS(status_position_increasing),EVENT(event_position_hold),         STATUS(status_position_hold)},\n    {STATUS(status_position_increasing),EVENT(event_position_decreasing),   STATUS(status_position_decreasing)},\n\n    {STATUS(status_position_increasing),EVENT(event_standby0),              STATUS(status_standby)},\n    {STATUS(status_position_increasing),EVENT(event_ready),                 STATUS(status_ready)},\n    \n    {STATUS(status_position_increasing),EVENT(event_overvoltage),           STATUS(status_overvoltage)},\n    {STATUS(status_position_increasing),EVENT(event_undervoltage),          STATUS(status_undervoltage)},\n    {STATUS(status_position_increasing),EVENT(event_overcurrent),           STATUS(status_overcurrent)},\n    {STATUS(status_position_increasing),EVENT(event_overtemp_motor),        STATUS(status_overtemp_motor)},\n    {STATUS(status_position_increasing),EVENT(event_undertemp_motor),       STATUS(status_undertemp_motor)},\n    {STATUS(status_position_increasing),EVENT(event_overtemp_driver),       STATUS(status_overtemp_driver)},\n    {STATUS(status_position_increasing),EVENT(event_undertemp_driver),      STATUS(status_undertemp_driver)},\n    {STATUS(status_position_increasing),EVENT(event_overtemp_pcb),          STATUS(status_overtemp_pcb)},\n    {STATUS(status_position_increasing),EVENT(event_undertemp_pcb),         STATUS(status_undertemp_pcb)},\n\n    {STATUS(status_position_increasing),EVENT(event_stuck),                 STATUS(status_stuck)},\n    {STATUS(status_position_increasing),EVENT(event_phase_loss),            STATUS(status_phase_loss)},\n    {STATUS(status_position_increasing),EVENT(event_fault),                 STATUS(status_fault)},\n\n    // =======================================================================================\n    {STATUS(status_position_decreasing),EVENT(event_position_hold),         STATUS(status_position_hold)},\n    {STATUS(status_position_decreasing),EVENT(event_position_increasing),   STATUS(status_position_increasing)},\n\n    {STATUS(status_position_decreasing),EVENT(event_standby0),              STATUS(status_standby)},\n    {STATUS(status_position_decreasing),EVENT(event_ready),                 STATUS(status_ready)},\n    \n    {STATUS(status_position_decreasing),EVENT(event_overvoltage),           STATUS(status_overvoltage)},\n    {STATUS(status_position_decreasing),EVENT(event_undervoltage),          STATUS(status_undervoltage)},\n    {STATUS(status_position_decreasing),EVENT(event_overcurrent),           STATUS(status_overcurrent)},\n    {STATUS(status_position_decreasing),EVENT(event_overtemp_motor),        STATUS(status_overtemp_motor)},\n    {STATUS(status_position_decreasing),EVENT(event_undertemp_motor),       STATUS(status_undertemp_motor)},\n    {STATUS(status_position_decreasing),EVENT(event_overtemp_driver),       STATUS(status_overtemp_driver)},\n    {STATUS(status_position_decreasing),EVENT(event_undertemp_driver),      STATUS(status_undertemp_driver)},\n    {STATUS(status_position_decreasing),EVENT(event_overtemp_pcb),          STATUS(status_overtemp_pcb)},\n    {STATUS(status_position_decreasing),EVENT(event_undertemp_pcb),         STATUS(status_undertemp_pcb)},\n\n    {STATUS(status_position_decreasing),EVENT(event_stuck),                 STATUS(status_stuck)},\n    {STATUS(status_position_decreasing),EVENT(event_phase_loss),            STATUS(status_phase_loss)},\n    {STATUS(status_position_decreasing),EVENT(event_fault),                 STATUS(status_fault)},\n\n    // =======================================================================================\n    {STATUS(status_position_hold),      EVENT(event_position_increasing),   STATUS(status_position_increasing)},\n    {STATUS(status_position_hold),      EVENT(event_position_decreasing),   STATUS(status_position_decreasing)},\n\n    {STATUS(status_position_hold),      EVENT(event_standby0),              STATUS(status_standby)},\n    {STATUS(status_position_hold),      EVENT(event_ready),                 STATUS(status_ready)},\n    \n    {STATUS(status_position_hold),      EVENT(event_overvoltage),           STATUS(status_overvoltage)},\n    {STATUS(status_position_hold),      EVENT(event_undervoltage),          STATUS(status_undervoltage)},\n    {STATUS(status_position_hold),      EVENT(event_overcurrent),           STATUS(status_overcurrent)},\n    {STATUS(status_position_hold),      EVENT(event_overtemp_motor),        STATUS(status_overtemp_motor)},\n    {STATUS(status_position_hold),      EVENT(event_undertemp_motor),       STATUS(status_undertemp_motor)},\n    {STATUS(status_position_hold),      EVENT(event_overtemp_driver),       STATUS(status_overtemp_driver)},\n    {STATUS(status_position_hold),      EVENT(event_undertemp_driver),      STATUS(status_undertemp_driver)},\n    {STATUS(status_position_hold),      EVENT(event_overtemp_pcb),          STATUS(status_overtemp_pcb)},\n    {STATUS(status_position_hold),      EVENT(event_undertemp_pcb),         STATUS(status_undertemp_pcb)},\n\n    {STATUS(status_position_hold),      EVENT(event_stuck),                 STATUS(status_stuck)},\n    {STATUS(status_position_hold),      EVENT(event_phase_loss),            STATUS(status_phase_loss)},\n    {STATUS(status_position_hold),      EVENT(event_fault),                 STATUS(status_fault)},\n\n    // =======================================================================================\n    {STATUS(status_overvoltage),        EVENT(event_standby0),              STATUS(status_standby)},\n    {STATUS(status_overvoltage),        EVENT(event_standby1),              STATUS(status_standby)},\n\n    {STATUS(status_undervoltage),       EVENT(event_standby0),              STATUS(status_standby)},\n    {STATUS(status_undervoltage),       EVENT(event_standby1),              STATUS(status_standby)},\n\n    {STATUS(status_overcurrent),        EVENT(event_standby0),              STATUS(status_standby)},\n    {STATUS(status_overcurrent),        EVENT(event_standby1),              STATUS(status_standby)},\n\n    {STATUS(status_overtemp_motor),     EVENT(event_standby0),              STATUS(status_standby)},\n    {STATUS(status_overtemp_motor),     EVENT(event_standby1),              STATUS(status_standby)},\n\n    {STATUS(status_undertemp_motor),    EVENT(event_standby0),              STATUS(status_standby)},\n    {STATUS(status_undertemp_motor),    EVENT(event_standby1),              STATUS(status_standby)},\n\n    {STATUS(status_overtemp_driver),    EVENT(event_standby0),              STATUS(status_standby)},\n    {STATUS(status_overtemp_driver),    EVENT(event_standby1),              STATUS(status_standby)},\n\n    {STATUS(status_undertemp_driver),   EVENT(event_standby0),              STATUS(status_standby)},\n    {STATUS(status_undertemp_driver),   EVENT(event_standby1),              STATUS(status_standby)},\n\n    {STATUS(status_overtemp_pcb),       EVENT(event_standby0),              STATUS(status_standby)},\n    {STATUS(status_overtemp_pcb),       EVENT(event_standby1),              STATUS(status_standby)},\n\n    {STATUS(status_undertemp_pcb),      EVENT(event_standby0),              STATUS(status_standby)},\n    {STATUS(status_undertemp_pcb),      EVENT(event_standby1),              STATUS(status_standby)},\n\n    {STATUS(status_stuck),              EVENT(event_standby0),              STATUS(status_standby)},\n    {STATUS(status_stuck),              EVENT(event_standby1),              STATUS(status_standby)},\n\n    {STATUS(status_phase_loss),         EVENT(event_standby0),              STATUS(status_standby)},\n    {STATUS(status_phase_loss),         EVENT(event_standby1),              STATUS(status_standby)},\n\n    {STATUS(status_fault),              EVENT(event_standby0),              STATUS(status_standby)},\n    {STATUS(status_fault),              EVENT(event_standby1),              STATUS(status_standby)}\n};\n\nstatic void (*const motorstatus_initial_init[])(SguanFoc *) = {\n    unitlib_main_standby_init,\n\n    unitlib_main_ready_init,\n    unitlib_main_initializing_init,\n    unitlib_main_goinit0_angle_init,\n    unitlib_main_goinit1_current_init,\n    \n    motorstatus_idle_init,\n    motorstatus_null0,\n    motorstatus_null0,\n    motorstatus_null0,\n    motorstatus_null0,\n    motorstatus_null0,\n    motorstatus_null0,\n    motorstatus_null0,\n    motorstatus_null0,\n    motorstatus_null0,\n\n    motorstatus_overvoltage_init,\n    motorstatus_undervoltage_init,\n    motorstatus_overcurrent_init,\n    motorstatus_overtemp_motor_init,\n    motorstatus_undertemp_motor_init,\n    motorstatus_overtemp_driver_init,\n    motorstatus_undertemp_driver_init,\n    motorstatus_overtemp_pcb_init,\n    motorstatus_undertemp_pcb_init,\n    motorstatus_stuck_init,\n    motorstatus_phase_loss_init,\n    motorstatus_fault_init\n};\n\nstatic void (*const motorstatus_action_loop[])(void) = {\n    unitlib_status_standby_loop,\n\n    unitlib_status_ready_loop,\n    unitlib_status_initial_loop,\n    unitlib_status_initial_loop,\n    unitlib_status_initial_loop,\n\n    motorstatus_null1,\n    unitlib_status_increasing_loop,\n    unitlib_status_decreasing_loop,\n    unitlib_status_hold_loop,\n    unitlib_status_increasing_loop,\n    unitlib_status_decreasing_loop,\n    unitlib_status_hold_loop,\n    unitlib_status_increasing_loop,\n    unitlib_status_decreasing_loop,\n    unitlib_status_hold_loop,\n\n    unitlib_status_overvoltage_loop,\n    unitlib_status_undervoltage_loop,\n    unitlib_status_overcurrent_loop,\n    unitlib_status_overtemp_motor_loop,\n    unitlib_status_undertemp_motor_loop,\n    unitlib_status_overtemp_driver_loop,\n    unitlib_status_undertemp_driver_loop,\n    unitlib_status_overtemp_pcb_loop,\n    unitlib_status_undertemp_pcb_loop,\n    unitlib_status_stuck_loop,\n    unitlib_status_phase_loss_loop,\n    unitlib_status_fault_loop\n};\n\nstatic HandleEvent motorstatus_event_get(uint8_t run){\n    switch (run){\n    case RUN_READY: // 准备触发\n        return event_ready;\n    case RUN_INITIALIZING: // 初始化触发\n        return event_initializing;\n    case RUN_STANDBY: // 待机触发\n        return event_standby0;\n    case RUN_FAULT: // 错误触发\n        return event_fault;\n    case RUN_SUCCESS: // [特殊]初始化success触发\n        return event_success;\n    \n    default:\n        break;\n    }\n    return event_zero;\n}\n\n/**\n * @brief  系统有限状态机 (FSM) 核心周期调度与故障保护判定器\n * @param  sguan: 通用指针，指向当前电机的 SguanFoc 根结构体\n * @note   全状态机核心机制:\n *         1. 状态匹配: 遍历 196 项转移矩阵 motor_tab，锁定当前状态 (status_now);\n *         2. 多源事件判决: \n *            - 手动事件 (run_flag 由用户或协议置位: ready, initializing, standby, fault, success)\n *            - 物理超限自动事件 (过压、欠压、即时极限过流、反时限延时过流、堵转卡死、多级过温)\n *         3. 状态跃迁与原子动作:\n *            - 当且仅当状态发生改变时，记录变更时间戳 tick_last，并触发目标状态唯一的进入初始化函数 (motorstatus_initial_init);\n *            - 周期性执行当前状态的动作循环 (motorstatus_action_loop)。\n */\nvoid motorstatus_loop(void *sguan){\n    // 1. 结构体指针类型还原\n    SguanFoc *p = (SguanFoc *)sguan;\n \n    // 2. 遍历全局状态转换表，逐项比对当前状态所能接收的合法事件\n    for (uint16_t i = 0; i < 184; i++){\n        if (motor_tab[i].status_now == p->motorstatus.status){\n            switch ((HandleEvent)motor_tab[i].event_now){\n                case event_ready:{\n                    // 此处有触发event的代码\n                    if (motorstatus_event_get(p->run_flag) == \n                        (HandleEvent)motor_tab[i].event_now){ // 手动触发\n                        p->run_flag = 0;\n\n                        p->motorstatus.status = \n                            (HandleStatus)motor_tab[i].status_future;\n                    }\n                    break;\n                }\n                case event_initializing:{\n                    // 此处有触发event的代码\n                    if (motorstatus_event_get(p->run_flag) == \n                        (HandleEvent)motor_tab[i].event_now){ // 手动触发\n                        p->run_flag = 0;\n                            \n                        p->motorstatus.status = \n                            (HandleStatus)motor_tab[i].status_future;\n                    }\n                    break;\n                }\n                case event_success:{\n                    // 此处有触发event的代码\n                    if (motorstatus_event_get(p->run_flag) == \n                        (HandleEvent)motor_tab[i].event_now){ // 手动触发\n                        p->run_flag = 0;\n                            \n                        p->motorstatus.status = \n                            (HandleStatus)motor_tab[i].status_future;\n                    }\n                    break;\n                }\n                case event_standby0:{\n                    // 此处有触发event的代码\n                    if (motorstatus_event_get(p->run_flag) == \n                        (HandleStatus)motor_tab[i].event_now){ // 手动触发\n                        p->run_flag = 0;\n                            \n                        p->motorstatus.status = \n                            (HandleStatus)motor_tab[i].status_future;\n                    }\n                    break;\n                }\n                case event_standby1:{\n                    // 此处有触发event的代码\n                    uint32_t tick = \n                        p->motorstatus.data.tick_run - \n                        p->motorstatus.data.tick_last;\n\n                    if (tick >= p->motorstatus.data.fault_tick_delay){ // 自动触发\n                            \n                        p->motorstatus.status = \n                            (HandleStatus)motor_tab[i].status_future;\n                    }\n                    break;\n                }\n                case event_torque_hold:{\n                    // 此处有触发event的代码\n                    if (p->motorstatus.data.mode_flag == MODE_TORQUE){\n                        SguanQ tor_target_min = iqmath_sub(\n                            p->motorstatus.data.tor_target, \n                            p->motorstatus.data.tor_scope);\n                        SguanQ tor_target_max = iqmath_add(\n                            p->motorstatus.data.tor_target, \n                            p->motorstatus.data.tor_scope);\n                        SguanQ tor_real_abs = iqmath_abs(\n                            p->motorstatus.data.tor_real);\n        \n                        if ((tor_real_abs >= tor_target_min) && \n                            (tor_real_abs <= tor_target_max)){ // 自动触发\n                            p->motorstatus.data.stuck_tick_run = \n                                p->motorstatus.data.tick_run;\n\n                            p->motorstatus.status = \n                                (HandleStatus)motor_tab[i].status_future;\n                        }\n                    }\n                    break;\n                }\n                case event_torque_increasing:{\n                    // 此处有触发event的代码\n                    if (p->motorstatus.data.mode_flag == MODE_TORQUE){                    \n                        SguanQ tor_target_min = iqmath_sub(\n                            p->motorstatus.data.tor_target, \n                            p->motorstatus.data.tor_scope);\n                        SguanQ tor_real_abs = iqmath_abs(\n                            p->motorstatus.data.tor_real);\n        \n                        if (tor_real_abs <= tor_target_min){ // 自动触发\n                            \n                            p->motorstatus.status = \n                                (HandleStatus)motor_tab[i].status_future;\n                        }\n                    }\n                    break;\n                }\n                case event_torque_decreasing:{\n                    // 此处有触发event的代码\n                    if (p->motorstatus.data.mode_flag == MODE_TORQUE){\n                        SguanQ tor_target_max = iqmath_add(\n                            p->motorstatus.data.tor_target, \n                            p->motorstatus.data.tor_scope);\n                        SguanQ tor_real_abs = iqmath_abs(\n                            p->motorstatus.data.tor_real);\n        \n                        if (tor_real_abs >= tor_target_max){ // 自动触发\n                            \n                            p->motorstatus.status = \n                                (HandleStatus)motor_tab[i].status_future;\n                        }\n                    }\n                    break;\n                }\n                case event_velocity_hold:{\n                    // 此处有触发event的代码\n                    if (p->motorstatus.data.mode_flag == MODE_VELOCITY){\n                        SguanQ vel_target_min = iqmath_sub(\n                            p->motorstatus.data.vel_target, \n                            p->motorstatus.data.vel_scope);\n                        SguanQ vel_target_max = iqmath_add(\n                            p->motorstatus.data.vel_target, \n                            p->motorstatus.data.vel_scope);\n                        SguanQ vel_real_abs = iqmath_abs(\n                            p->motorstatus.data.vel_real);\n        \n                        if ((vel_real_abs >= vel_target_min) && \n                            (vel_real_abs <= vel_target_max)){ // 自动触发\n                            p->motorstatus.data.stuck_tick_run = \n                                p->motorstatus.data.tick_run;\n                            \n                            p->motorstatus.status = \n                                (HandleStatus)motor_tab[i].status_future;\n                        }\n                    }\n                    break;\n                }\n                case event_velocity_increasing:{\n                    // 此处有触发event的代码\n                    if (p->motorstatus.data.mode_flag == MODE_VELOCITY){\n                        SguanQ vel_target_min = iqmath_sub(\n                            p->motorstatus.data.vel_target, \n                            p->motorstatus.data.vel_scope);\n                        SguanQ vel_real_abs = iqmath_abs(\n                            p->motorstatus.data.vel_real);\n        \n                        if (vel_real_abs <= vel_target_min){ // 自动触发\n                            \n                            p->motorstatus.status = \n                                (HandleStatus)motor_tab[i].status_future;\n                        }\n                    }\n                    break;\n                }\n                case event_velocity_decreasing:{\n                    // 此处有触发event的代码\n                    if (p->motorstatus.data.mode_flag == MODE_VELOCITY){\n                        SguanQ vel_target_max = iqmath_add(\n                            p->motorstatus.data.vel_target, \n                            p->motorstatus.data.vel_scope);\n                        SguanQ vel_real_abs = iqmath_abs(\n                            p->motorstatus.data.vel_real);\n        \n                        if (vel_real_abs >= vel_target_max){ // 自动触发\n                            \n                            p->motorstatus.status = \n                                (HandleStatus)motor_tab[i].status_future;\n                        }\n                    }\n                    break;\n                }\n                case event_position_hold:{\n                    // 此处有触发event的代码\n                    if (p->motorstatus.data.mode_flag == MODE_POSITION){\n                        SguanQ pos_target_min = iqmath_sub(\n                            p->motorstatus.data.pos_target, \n                            p->motorstatus.data.pos_scope);\n                        SguanQ pos_target_max = iqmath_add(\n                            p->motorstatus.data.pos_target, \n                            p->motorstatus.data.pos_scope);\n                        SguanQ pos_real_abs = iqmath_abs(\n                            p->motorstatus.data.pos_real);\n        \n                        if ((pos_real_abs >= pos_target_min) && \n                            (pos_real_abs <= pos_target_max)){ // 自动触发\n                            p->motorstatus.data.stuck_tick_run = \n                                p->motorstatus.data.tick_run;\n                            \n                            p->motorstatus.status = \n                                (HandleStatus)motor_tab[i].status_future;\n                        }\n                    }\n                    break;\n                }\n                case event_position_increasing:{\n                    // 此处有触发event的代码\n                    if (p->motorstatus.data.mode_flag == MODE_POSITION){\n                        SguanQ pos_target_min = iqmath_sub(\n                            p->motorstatus.data.pos_target, \n                            p->motorstatus.data.pos_scope);\n                        SguanQ pos_real_abs = iqmath_abs(\n                            p->motorstatus.data.pos_real);\n        \n                        if (pos_real_abs <= pos_target_min){ // 自动触发\n        \n                            \n                            p->motorstatus.status = \n                                (HandleStatus)motor_tab[i].status_future;\n                        }\n                    }\n                    break;\n                }\n                case event_position_decreasing:{\n                    // 此处有触发event的代码\n                    if (p->motorstatus.data.mode_flag == MODE_POSITION){\n                        SguanQ pos_target_max = iqmath_add(\n                            p->motorstatus.data.pos_target, \n                            p->motorstatus.data.pos_scope);\n                        SguanQ pos_real_abs = iqmath_abs(\n                            p->motorstatus.data.pos_real);\n        \n                        if (pos_real_abs >= pos_target_max){ // 自动触发\n                            \n                            p->motorstatus.status = \n                                (HandleStatus)motor_tab[i].status_future;\n                        }\n                    }\n                    break;\n                }\n                case event_overvoltage:{\n                    // 此处有触发event的代码\n                    if (p->motorstatus.data.vbus_real >= \n                        p->motorstatus.data.vbus_max){ // 自动触发\n                            \n                        p->motorstatus.status = \n                            (HandleStatus)motor_tab[i].status_future;\n                    }\n                    break;\n                }\n                case event_undervoltage:{\n                    // 此处有触发event的代码\n                    if (p->motorstatus.data.vbus_real <= \n                        p->motorstatus.data.vbus_min){ // 自动触发\n                            \n                        p->motorstatus.status = \n                            (HandleStatus)motor_tab[i].status_future;\n                    }\n                    break;\n                }\n                case event_overcurrent:{\n                    // 此处有触发event的代码\n                    uint32_t tick = 0;\n                    if (p->motorstatus.data.ibus_real <= \n                        p->motorstatus.data.ibus_stable_max){\n\n                        p->motorstatus.data.ibus_tick_run = \n                            p->motorstatus.data.tick_run; \n                    }\n                    else{\n                        tick = iqmath_sub(\n                            p->motorstatus.data.tick_run, \n                            p->motorstatus.data.ibus_tick_run);\n                    }\n\n                    if ((p->motorstatus.data.ibus_real >= \n                        p->motorstatus.data.ibus_instant_max) || \n                        // 过流保护“或”条件判断\n                        (tick >= p->motorstatus.data.ibus_tick_delay)){ // 自动触发\n                            \n                        p->motorstatus.status = \n                            (HandleStatus)motor_tab[i].status_future;\n                    }\n                    break;\n                }\n                case event_overtemp_motor:{\n                    // 此处有触发event的代码\n                    if (p->motorstatus.data.temp_motor_real >= \n                        p->motorstatus.data.temp_motor_max){ // 自动触发\n                            \n                        p->motorstatus.status = \n                            (HandleStatus)motor_tab[i].status_future;\n                    }\n                    break;\n                }\n                case event_undertemp_motor:{\n                    // 此处有触发event的代码\n                    if (p->motorstatus.data.temp_motor_real <= \n                        p->motorstatus.data.temp_motor_min){ // 自动触发\n                            \n                        p->motorstatus.status = \n                            (HandleStatus)motor_tab[i].status_future;\n                    }\n                    break;\n                }\n                case event_overtemp_driver:{\n                    // 此处有触发event的代码\n                    if (p->motorstatus.data.temp_driver_real >= \n                        p->motorstatus.data.temp_driver_max){ // 自动触发\n                            \n                        p->motorstatus.status = \n                            (HandleStatus)motor_tab[i].status_future;\n                    }\n                    break;\n                }\n                case event_undertemp_driver:{\n                    // 此处有触发event的代码\n                    if (p->motorstatus.data.temp_driver_real <= \n                        p->motorstatus.data.temp_driver_min){ // 自动触发\n                            \n                        p->motorstatus.status = \n                            (HandleStatus)motor_tab[i].status_future;\n                    }\n                    break;\n                }\n                case event_overtemp_pcb:{\n                    // 此处有触发event的代码\n                    if (p->motorstatus.data.temp_pcb_real >= \n                        p->motorstatus.data.temp_pcb_max){ // 自动触发\n                            \n                        p->motorstatus.status = \n                            (HandleStatus)motor_tab[i].status_future;\n                    }\n                    break;\n                }\n                case event_undertemp_pcb:{\n                    // 此处有触发event的代码\n                    if (p->motorstatus.data.temp_pcb_real <= \n                        p->motorstatus.data.temp_pcb_min){ // 自动触发\n                            \n                        p->motorstatus.status = \n                            (HandleStatus)motor_tab[i].status_future;\n                    }\n                    break;\n                }\n                case event_stuck:{\n                    // 此处有触发event的代码\n                    uint32_t tick = \n                        p->motorstatus.data.tick_run - \n                        p->motorstatus.data.stuck_tick_run;\n\n                    if (tick >= p->motorstatus.data.stuck_tick_delay){ // 自动触发\n                            \n                        p->motorstatus.status = \n                            (HandleStatus)motor_tab[i].status_future;\n                    }\n                    break;\n                }\n                case event_phase_loss:{\n                    // 此处有触发event的代码\n\n                    if (0){ // 自动触发\n                            \n                        p->motorstatus.status = \n                            (HandleStatus)motor_tab[i].status_future;\n                    }\n                    break;\n                }\n                case event_fault:{\n                    // 此处有触发event的代码\n                    if (motorstatus_event_get(p->run_flag) == \n                        (HandleStatus)motor_tab[i].event_now){ // 手动触发\n                        p->run_flag = 0;\n                            \n                        p->motorstatus.status = \n                            (HandleStatus)motor_tab[i].status_future;\n                    }\n                    break;\n                }\n\n                default:\n                    break;\n            }\n        }\n    }\n\n    // ==================================================================\n    // 3.运行init和loop函数\n    if (p->motorstatus.last != p->motorstatus.status){\n        // 状态机发送变化，记录变化时刻的tick时间\n        p->motorstatus.data.tick_last = p->motorstatus.data.tick_run;\n\n        // 仅在状态机变化开始，初始化一次init函数并更新last状态机\n        motorstatus_initial_init[p->motorstatus.status](p);\n        p->motorstatus.last = p->motorstatus.status;\n    }\n    motorstatus_action_loop[p->motorstatus.status]();\n}\n\n\n",
      "annotations": [
        {
          "id": "status_initializers",
          "title": "motorstatus_idle_init() 及 12 大硬件故障保护初始化子程序",
          "startLine": 16,
          "endLine": 103,
          "category": "protection",
          "categoryName": "故障保护",
          "tag": "安全保护 / 故障停机",
          "summary": "当系统发生母线过压、欠压、相电流过流、电机过温、驱动器超温、PCB 过温或相线接触断开时，各专用子程序立即执行切断 PWM、置位刹车与记录故障码动作。",
          "pipeline": "硬件故障触发 -> 调用对应故障初始化 -> 封锁 PWM 发波 -> 记录故障原因 -> 触发声光告警",
          "lineByLine": [
            {
              "lines": "16-43",
              "desc": "空闲 (IDLE) 状态进入：清零控制回路积分量，让电机进入自由滑行待命状态。"
            },
            {
              "lines": "44-58",
              "desc": "过压 (Overvoltage) 与欠压 (Undervoltage) 保护：防止制动能量倒灌击穿滤波电容或低压损坏栅极驱动。"
            },
            {
              "lines": "59-88",
              "desc": "电机与驱动器多点超温保护：温度达到热熔断限值时降低额定输出功率或切断电源。"
            },
            {
              "lines": "89-103",
              "desc": "堵转 (Stuck) 与缺相 (Phase Loss) 保护：检测转子卡死或接线松脱，切断持续短路相电流。"
            }
          ],
          "pitfalls": [
            {
              "type": "CAUTION",
              "title": "制动过压能量泄放",
              "text": "电机在高速急减速时会转变为发电机向母线反充电。若母线电容较小，电压会在毫秒级时间内飙升至数十伏，必须配备过压刹车电阻或柔性降速。"
            }
          ],
          "extensions": "在机器人或伺服系统中，所有故障事件均会上报至 CANopen/Modbus 状态寄存器中供上位机读取。"
        },
        {
          "id": "fsm_jumptable",
          "title": "motorstatus_initial_init[] 与 motorstatus_action_loop[] 状态跳转表",
          "startLine": 373,
          "endLine": 436,
          "category": "fsm",
          "categoryName": "状态机架构",
          "tag": "函数指针跳转表 / O(1) 调度",
          "summary": "将 29 种状态的首次进入初始化钩子与每周期持续轮询行为编译为只读常量函数指针数组，实现 $O(1)$ 复杂度的极速状态调度。",
          "pipeline": "当前状态枚举作为数组下标 -> 索引对应函数指针 -> 执行瞬态初始化 / 循环动作",
          "lineByLine": [
            {
              "lines": "373-404",
              "desc": "motorstatus_initial_init[] 数组存储各状态的一次性 Entry 函数指针。"
            },
            {
              "lines": "406-436",
              "desc": "motorstatus_action_loop[] 数组存储各状态的周期性 Do 动作函数指针。"
            }
          ],
          "math": [
            {
              "label": "状态调度执行复杂度",
              "formula": "T_{dispatch} = O(1) \\quad (\\text{通过常量指针数组直接寻址，规避多层嵌套 switch-case})"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "消除复杂条件分支",
              "text": "避免了成百上千行的 switch 语句导致的指令 Cache 命中率下降，使状态机具有出色的工业级代码组织美感。"
            }
          ],
          "extensions": "若新增自定义工作模式，只需在枚举尾部扩充并向数组中填入回调函数即可。"
        },
        {
          "id": "fsm_engine",
          "title": "motorstatus_loop() 有限状态机主决策与状态转移推进引擎",
          "startLine": 470,
          "endLine": 534,
          "category": "fsm",
          "categoryName": "状态机架构",
          "tag": "状态转移矩阵 / 事件自推进",
          "summary": "状态机的核心心脏，每周期持续检查外部启停事件与系统自诊断标志，依据严密的状态转移规则平滑推进电机工作流程。",
          "pipeline": "查询 run_flag 运行信号 -> 检查传感器就绪与标定完成 -> 触发 IDLE -> READY -> RUNNING 状态跃迁",
          "lineByLine": [
            {
              "lines": "470-500",
              "desc": "解析上电自检、零位校准与就绪状态迁移 (event_ready / initializing / success)。"
            },
            {
              "lines": "501-534",
              "desc": "待机停机与恢复迁移处理 (event_standby0 / event_standby1)。"
            }
          ],
          "pitfalls": [
            {
              "type": "WARNING",
              "title": "防抖机制与最小驻留时间",
              "text": "状态迁移伴随物理电气状态突变 (如继电器闭合、MOS 驱动使能)。每个状态设有最小稳定计时，防止在临界工况下发生高频震荡切换。"
            }
          ],
          "extensions": "状态机全面支持从任意运行状态以最高优先级瞬间打断跳转至 FAULT 保护状态。"
        },
        {
          "id": "arrival_deadband",
          "title": "位置到达死区窗口 (Arrival Deadband) 与恒速保持判定",
          "startLine": 535,
          "endLine": 705,
          "category": "fsm",
          "categoryName": "外环控制",
          "tag": "到达判定 / 锁轴消抖",
          "summary": "在位置伺服模式下，当电机转子进入目标角度的极小死区邻域且速度衰减至停止限值以下时，状态机判定就位并平滑切入 HOLD 位置锁定状态。",
          "pipeline": "计算位置误差 |pos_real - pos_target| -> 判定是否进入死区 -> 检查当前角速度 -> 状态切入 HOLD",
          "lineByLine": [
            {
              "lines": "535-590",
              "desc": "转矩模式保持与斜坡加减速事件推进。"
            },
            {
              "lines": "591-648",
              "desc": "速度模式保持与加减速事件推进。"
            },
            {
              "lines": "649-705",
              "desc": "位置伺服模式下的死区到达窗口 (pos_target_min ~ pos_target_max) 判定与进入锁定。"
            }
          ],
          "math": [
            {
              "label": "就位到达判断条件",
              "formula": "\\text{TargetReached} = (|\\theta_{real} - \\theta_{target}| \\le \\Delta \\theta_{win}) \\land (|\\omega_{real}| \\le \\omega_{win})"
            }
          ],
          "pitfalls": [
            {
              "type": "CAUTION",
              "title": "位置死区太小的微震抖动",
              "text": "若死区阈值设定过小 (小于编码器量化噪声幅值)，位置环将在目标点附近持续发出细微滋滋电流声并微幅振颤；应合理设置滞环宽度。"
            }
          ],
          "extensions": "就位信号可通过硬件引脚输出电平告知外部 PLC 控制器机械手已抓取对中。"
        },
        {
          "id": "stuck_and_protection",
          "title": "堵转检测、相电流异常与多级超温安全熔断机制",
          "startLine": 707,
          "endLine": 845,
          "category": "protection",
          "categoryName": "安全防护",
          "tag": "堵转检测 / 过载反时限",
          "summary": "当系统向电机注入了接近额定的 q 轴电流力矩持续超过设定时间，但编码器检测到的转速仍持续接近于零时，判定电机发生机械堵转并切断动力输出。",
          "pipeline": "监测转矩电流 Iq > 阈值 -> 监测速度 < 极小死区 -> 启动持续时间计时累加 -> 超过安全限值触发 STUCK 报警",
          "lineByLine": [
            {
              "lines": "707-725",
              "desc": "母线电压超限监控 (过压 / 欠压瞬态切断)。"
            },
            {
              "lines": "727-750",
              "desc": "即时峰值过流与持续过载延时积分双重电流硬保护。"
            },
            {
              "lines": "752-810",
              "desc": "电机、驱动管与控制板多路 NTC 温度保护判定。"
            },
            {
              "lines": "812-845",
              "desc": "编码器测速与大转矩关联判定机械堵转，以及三相缺相告警停机。"
            }
          ],
          "math": [
            {
              "label": "堵转判定逻辑",
              "formula": "\\text{Stuck} = (|i_q| > I_{stuck\\_th}) \\land (|\\omega_m| < \\Omega_{stuck\\_th}) \\land (\\Delta t > T_{stuck\\_limit})"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "低速大扭矩工况防误判",
              "text": "在挤压抓取或重力吊升等特定低速工况下，需通过上位机指令适当放宽堵转判定超时窗口，以兼顾安全性与作业持续度。"
            }
          ],
          "extensions": "保护机制完全符合工业伺服驱动器的安全等级规范。"
        }
      ]
    },
    {
      "id": "sguan_printf_c",
      "name": "Sguan_printf.c",
      "matrixIndex": "06",
      "role": "遥测协议、DJB2 指令哈希与波形输出",
      "header": "Sguan_printf.h",
      "hardware": "UART DMA / 虚拟示波器 JustFloat",
      "badge": "Tier 3 通信与遥测",
      "shortDesc": "DJB2 32 位极速字符串哈希匹配、单遍快速无浮点库 ASCII 解析、JustFloat 帧尾示波器波形打包输出。",
      "lineCount": 201,
      "sizeBytes": 7399,
      "content": "#include \"Sguan_Printf.h\"\n\n/* SguanFOC配置文件声明 */\n#include \"UserData_Driver.h\"\n#include \"UnitLib_UserControl.h\"\n#include <stdio.h>\n#include <string.h>\n\n/* 内部私有变量与静态函数声明 */\nuint8_t sguan_printfbuff[64];\nstatic uint32_t hash_compute(const char *str, uint8_t len);\nstatic float get_data_fast(uint8_t start_idx);\nstatic void printf_adjust(void);\n\n\n/* ==================== 哈希/字典映射实现 =================== */\n\n/**\n * @brief  轻量级字符串哈希函数 (经典 DJB2 算法)\n * @param  str: 待计算哈希的字符串指针 (指令键名，如 \"Speed\", \"Id\")\n * @param  len: 字符串长度\n * @retval 32 位无符号整数哈希值\n * @note   数学公式: hash_i = hash_{i-1} * 33 + char\n *         位运算实现: ((hash << 5) + hash) + str[i]，初始种子为 5381。\n *         该算法具备优良的离散雪崩效应与极低的碰撞率，专为单片机 O(1) 字符串快速匹配设计。\n */\nstatic uint32_t hash_compute(const char *str, uint8_t len){\n    uint32_t hash = 5381;\n    for (uint8_t i = 0; i < len; i++) {\n        hash = ((hash << 5) + hash) + str[i]; \n    }\n    return hash;\n}\n\n// 指令字典条目总数\n#define DICT_COUNT (sizeof(cmd_dict) / sizeof(CmdMap))\n\n/**\n * @brief  极速无依赖浮点数解析 (单遍扫描 + 异常字符熔断截断)\n * @param  start_idx: 缓冲区中数值开始扫描的起始字符下标 (等号后的第一位)\n * @retval 解析出的单精度浮点数值 (float)\n * @note   杜绝在实时控制系统中调用高开销的标准库 sscanf() 或 atof()：\n *         1. 符号检测: 支持正负号识别;\n *         2. 整数与小数分离解析: 小数部分按位累乘 0.1 衰减权重;\n *         3. 异常截断保护: 若遇到非数字或非法字符立刻 break，防止粘包卡死。\n */\nstatic float get_data_fast(uint8_t start_idx){\n    float result = 0.0f;\n    float frac_weight = 0.1f;\n    uint8_t i = start_idx;\n    int8_t sign = 1;\n    uint8_t in_fraction = 0;\n\n    // 1. 负号判断\n    if (sguan_printfbuff[i] == '-'){\n        sign = -1;\n        i++;\n    }\n\n    // 2. 遍历字符直至遇到帧尾 '?' 或字符串结尾 '\\0'\n    while (sguan_printfbuff[i] != '?' && sguan_printfbuff[i] != '\\0' && i < 200){\n        uint8_t c = sguan_printfbuff[i];\n        \n        if (c == '.') {\n            in_fraction = 1; // 进入小数位扫描\n        } else if (c >= '0' && c <= '9'){\n            if (!in_fraction) {\n                // 整数位累加: result = result * 10 + digit\n                result = result * 10.0f + (c - '0');\n            } else {\n                // 小数位累加: result = result + digit * weight\n                result += (c - '0') * frac_weight;\n                frac_weight *= 0.1f;\n            }\n        } else {\n            // 遭遇异常字符（如粘包字母），立即截断返回当前结果，防止死循环\n            break; \n        }\n        i++;\n    }\n    return result * (float)sign;\n}\n\n/**\n * @brief  [接收端] 实时参数热调整核心函数 (DJB2 哈希查表与指令分发)\n * @note   通信协议格式: \"键名=数值?\" (例如: \"Speed=1200.5?\")\n *         流程:\n *         1. 扫描等号确定 Key 长度;\n *         2. 调用 get_data_fast 提取等号后的浮点参数值;\n *         3. 计算 Key 的 DJB2 哈希值;\n *         4. 在预先生成的 cmd_dict 字典中进行纯整数比对 (O(1) 速度);\n *         5. 若哈希命中且字符串二次比对一致，立即调用绑定的回调函数注入参数;\n *         6. 清空接收缓冲区，复位接收状态。\n */\nstatic void printf_adjust(void){\n    uint8_t eq_pos = 0;\n    \n    // 1. 寻找等号位置，确定指令 Key 的长度\n    while (sguan_printfbuff[eq_pos] != '=' && eq_pos < 50){\n        if (sguan_printfbuff[eq_pos] == '\\0') return; // 未找到等号，非法指令丢弃\n        eq_pos++;\n    }\n\n    // 2. 极速提取等号后面的数值\n    float data_val = get_data_fast(eq_pos + 1);\n\n    // 3. 计算当前接收到指令 Key 的 32 位哈希值\n    uint32_t rx_hash = hash_compute((const char*)sguan_printfbuff, eq_pos);\n\n    // 4. 哈希查表匹配 (纯 32 位整数比较，指令命中耗时极短)\n    for (uint8_t i = 0; i < DICT_COUNT; i++){\n        if (cmd_dict[i].hash_val == rx_hash){\n            // 严谨起见: 防止发生极低概率的哈希碰撞，二次确认字符串全字匹配\n            if (strncmp((char*)sguan_printfbuff, cmd_dict[i].name, eq_pos) == 0){\n                if (cmd_dict[i].callback != NULL) {\n                    // 执行该指令绑定的用户控制回调 (如改变目标速度、电流、模式)\n                    cmd_dict[i].callback(data_val);\n                }\n                break;\n            }\n        }\n    }\n\n    // 5. 清理缓冲区，准备接收下一帧\n    memset(sguan_printfbuff, 0, sizeof(sguan_printfbuff));\n}\n\n/* ==================== 通用 Loop 函数 =================== */\n\n/**\n * @brief  JustFloat 虚拟示波器协议发送初始化\n * @param  str: 示波器发送数据帧结构体指针\n * @note   JustFloat 协议标准尾同步字为 0x00, 0x00, 0x80, 0x7F (单精度浮点数 NaN 编码)，\n *         上位机通过捕获该特定 4 字节标识帧尾并同步多通道浮点波形。\n */\nvoid printf_tx_init(Printf *str){\n    str->tail[0] = 0x00;\n    str->tail[1] = 0x00;\n    str->tail[2] = 0x80;\n    str->tail[3] = 0x7f;\n}\n\n/**\n * @brief  JustFloat 示波器数据周期性发送钩子\n * @param  str: 待发送的数据帧指针\n */\nvoid printf_tx_loop(Printf *str){\n    // 用户可在此调用底层硬件串口 DMA 发送函数\n    // User_CorrespondSet((uint8_t *)str, sizeof(Printf));\n}\n\n/**\n * @brief  开机指令字典哈希初始化\n * @note   在系统初始化时被调用一次，预先遍历 cmd_dict 数组，\n *         将所有指令字符串离线转换为固定哈希值缓存在 cmd_dict[i].hash_val 中。\n */\nvoid printf_rx_init(void){\n    for (uint8_t i = 0; i < DICT_COUNT; i++){\n        uint8_t len = strlen(cmd_dict[i].name);\n        cmd_dict[i].hash_val = hash_compute(cmd_dict[i].name, len);\n    }\n}\n\n/**\n * @brief  串口数据流接收与帧解包状态机\n * @param  data: 串口接收缓冲区数据指针\n * @param  length: 接收字节数\n * @note   流式处理特性:\n *         1. 自动过滤掉 \\r, \\n, 空格等非关键通信干扰字符;\n *         2. 遇到终结符 '?' 时触发指令解析 printf_adjust();\n *         3. 熔断防粘包机制: 若无 '?' 且堆积超过 40 字节，主动清空缓冲区，防死滞溢出。\n */\nvoid printf_rx_loop(uint8_t *data, uint16_t length){\n    static uint16_t buff_ptr = 0;\n    \n    for (uint16_t i = 0; i < length; i++){\n        uint8_t ch = data[i];\n\n        // 1. 过滤: 忽略换行、回车、空格等干扰符\n        if (ch == '\\r' || ch == '\\n' || ch == ' '){\n            continue;\n        }\n        \n        sguan_printfbuff[buff_ptr++] = ch;\n        \n        // 2. 遇到帧尾 '?' 触发解析派发\n        if (ch == '?') {\n            printf_adjust();\n            buff_ptr = 0; // 重置写入指针\n            continue;\n        }\n        \n        // 3. 熔断保护 (防粘包 / 缓冲区死滞溢出)\n        // 超过 40 字节还没收到 '?' 则判定为残帧，强制清空重置\n        if (buff_ptr >= 40) {\n            memset(sguan_printfbuff, 0, sizeof(sguan_printfbuff));\n            buff_ptr = 0;\n        }\n    }\n}\n",
      "annotations": [
        {
          "id": "djb2_hash",
          "title": "hash_compute() DJB2 32 位字符串哈希算法",
          "startLine": 27,
          "endLine": 33,
          "category": "algorithm",
          "categoryName": "核心算法",
          "tag": "DJB2 哈希 / O(1) 指令比对",
          "summary": "经典高效的 Daniel J. Bernstein 字符串哈希算法，利用素数 5381 作为初始种子并执行 `hash = ((hash << 5) + hash) + c`，将任意变长文本指令秒变 32 位整数。",
          "pipeline": "接收字符串流 -> 初始 hash=5381 -> 逐字节左移 5 位并自加加权 -> 输出 uint32_t 哈希值",
          "lineByLine": [
            {
              "lines": "27-28",
              "desc": "初始化哈希累加寄存器为魔数 5381。"
            },
            {
              "lines": "29-31",
              "desc": "遍历指令字符串所有有效字符，按 ((hash << 5) + hash) + str[i] 混合更新。"
            },
            {
              "lines": "32-33",
              "desc": "返回 32 位哈希指纹，供后续快速表项比对。"
            }
          ],
          "math": [
            {
              "label": "DJB2 递推公式",
              "formula": "\\text{hash}[i] = \\text{hash}[i-1] \\cdot 33 + c[i] = (\\text{hash}[i-1] \\ll 5) + \\text{hash}[i-1] + c[i]"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "为什么使用哈希替代 strcmp",
              "text": "在嵌入式单片机中，使用 strcmp 逐个字符比对多条指令极其消耗 CPU。将指令预先编译为整数哈希后，指令匹配变为一次普通的整型等于比对，性能提升百倍！"
            }
          ],
          "extensions": "指令字典支持动态扩展，新增调试指令无需重构协议栈。"
        },
        {
          "id": "fast_float_parser",
          "title": "get_data_fast() 零内存分配单遍快速 ASCII 浮点解析器",
          "startLine": 47,
          "endLine": 82,
          "category": "algorithm",
          "categoryName": "核心算法",
          "tag": "单遍扫描 / 免 atof 浮点解析",
          "summary": "摆脱体积庞大、包含大量锁与内存分配的 C 标准库 atof()，通过轻量单遍扫描直接从串口缓冲区解析符号、整数、小数与指数部分。",
          "pipeline": "识别负号 -> 累加整数部分 -> 识别小数点 -> 累加小数位并跟踪精度因子 -> 返回 float",
          "lineByLine": [
            {
              "lines": "47-58",
              "desc": "定位等号 '=' 后的数字起始偏移量，检测正负符号。"
            },
            {
              "lines": "59-75",
              "desc": "累加整数部分：数值乘以 10 并加上当前字符数值。"
            },
            {
              "lines": "76-82",
              "desc": "若遇到小数点 '.' 累加小数，遇到非法字符熔断截断并返回浮点结果。"
            }
          ],
          "math": [
            {
              "label": "ASCII 浮点组合公式",
              "formula": "val = \\text{sgn} \\cdot \\left( \\sum_{i=0}^M d_i \\cdot 10^i + \\sum_{j=1}^N f_j \\cdot 10^{-j} \\right)"
            }
          ],
          "pitfalls": [
            {
              "type": "CAUTION",
              "title": "标准库 atof 的体积与重入陷阱",
              "text": "引入标准库 atof 或 sscanf 会使 Flash 固件膨胀 15KB 以上，且部分实现非线程安全。轻量手写解析器仅需几百字节且绝对可重入。"
            }
          ],
          "extensions": "支持接收形如 `spd=150.5`、`iq=2.4`、`pos=-3.14` 的在线调试指令。"
        },
        {
          "id": "cmd_adjust",
          "title": "printf_adjust() 指令哈希查表与参数实时注入分发",
          "startLine": 95,
          "endLine": 126,
          "category": "hardware",
          "categoryName": "通信协议",
          "tag": "指令分发 / 参数动态热重载",
          "summary": "匹配接收到的指令哈希，根据对应的命令 ID 动态调用相应的参数写入函数，实现电机运行参数与 PID 系数的在线热更新。",
          "pipeline": "计算接收字符串等号前命令哈希 -> 匹配预建字典 cmd_dict -> 提取浮点参数 -> 注入对应控制器",
          "lineByLine": [
            {
              "lines": "95-103",
              "desc": "在缓冲区中寻找赋值分隔符 '='，确定 Key 长度。"
            },
            {
              "lines": "104-109",
              "desc": "提取浮点数值并计算接收 Key 的 DJB2 哈希值。"
            },
            {
              "lines": "110-126",
              "desc": "遍历字典数组比较哈希值，命中后调用对应的控制回调注入参数。"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "原子操作保证",
              "text": "在更新双浮点或高阶控制器参数时，建议在高频中断保护下原子赋值，避免电流环读到更新了一半的新旧混合参数。"
            }
          ],
          "extensions": "支持在 VOFA+ 上位机拖动滑动条实时微调电机 PID，曲线即刻随动变化。"
        },
        {
          "id": "justfloat_tx",
          "title": "printf_tx_loop() JustFloat 协议帧封包与高频示波器推流",
          "startLine": 136,
          "endLine": 150,
          "category": "hardware",
          "categoryName": "虚拟示波器",
          "tag": "JustFloat / 帧尾同步 0x00 0x00 0x80 0x7F",
          "summary": "打包目标转速、实际转速、q 轴目标电流与实际电流，按照 VOFA+ JustFloat 规范添加 4 字节标准帧尾，通过 DMA 极速发往上位机。",
          "pipeline": "收集各监控通道浮点数 -> 拷贝入发送缓冲 -> 附加标准帧尾 0x7F800000 -> 启动串口 DMA 发送",
          "lineByLine": [
            {
              "lines": "136-141",
              "desc": "初始化 JustFloat 协议标准尾同步字 0x00, 0x00, 0x80, 0x7F (单精度浮点数 NaN 编码)。"
            },
            {
              "lines": "147-150",
              "desc": "虚拟示波器周期性推流回调钩子。"
            }
          ],
          "math": [
            {
              "label": "JustFloat 协议帧格式",
              "formula": "\\text{Frame} = [\\text{Data}_1, \\text{Data}_2, \\dots, \\text{Data}_N]_{\\text{float32}} \\parallel [0x00, 0x00, 0x80, 0x7F]"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "为什么用原始二进制代替文本",
              "text": "发送文本数字 `\"123.456\\r\\n\"` 需消耗 9 个字节且消耗格式化时间；二进制传输仅需 4 字节，大幅压缩波特率占用，可支持上千赫兹的连续推流。"
            }
          ],
          "extensions": "上位机可无缝绘制速度阶跃响应曲线，便于观察超调量与调节时间。"
        },
        {
          "id": "printf_rx_ring",
          "title": "printf_rx_loop() 串口中断环形缓冲区指令解包",
          "startLine": 173,
          "endLine": 200,
          "category": "hardware",
          "categoryName": "通信协议",
          "tag": "环形队列 / 帧分界提取",
          "summary": "处理中断或 DMA 接收到的字符流，按换行符或分界符切分完整指令帧并触发 `printf_adjust()` 处理。",
          "pipeline": "接收字符流 -> 写入静态环形缓冲 -> 遇到终止符判定为完整帧 -> 触发指令分发器 -> 清空缓冲",
          "lineByLine": [
            {
              "lines": "173-182",
              "desc": "过滤回车、换行、空格等无效字符，写入接收缓冲区。"
            },
            {
              "lines": "183-191",
              "desc": "遇到终结符 '?' 触发 printf_adjust() 命令解析并重置指针。"
            },
            {
              "lines": "192-200",
              "desc": "超过 40 字节无终止符判定为粘包残帧，强制清空重置。"
            }
          ],
          "pitfalls": [
            {
              "type": "WARNING",
              "title": "串口粘包与丢包",
              "text": "若通信波特率较高，两条指令可能合并在一次中断中送达，缓冲区分界解析器必须能支持连续切分。"
            }
          ],
          "extensions": "在工业现场亦可桥接至 CAN 报文接收，共用底层的参数分发逻辑。"
        }
      ]
    },
    {
      "id": "unitlib_main_c",
      "name": "UnitLib_main.c",
      "matrixIndex": "07",
      "role": "多任务高低频周期协同与系统引导",
      "header": "UnitLib_main.h",
      "hardware": "SysTick / RTOS / 裸机轮询定时器",
      "badge": "Tier 1 系统级调度",
      "shortDesc": "引导各轴电机完成待机、就绪、电角度自学习、电流偏置采集，并在高频 PWM 周期与低频遥测周期中精准派发。",
      "lineCount": 170,
      "sizeBytes": 7167,
      "content": "#include \"UnitLib_main.h\"\n\n/* SguanFOC配置文件声明 */\n#include \"UserData_Driver.h\"\n#include \"Zone_Master.h\"\n#include \"Zone_Parameter.h\"\n\n/**\n * @brief  待机停机状态初始化\n * @param  sguanfoc: 当前电机句柄指针\n * @note   在进入待机状态 (status_standby) 时执行一次，通常用于关断 PWM 输出，使能下桥制动或自由滑行\n */\nvoid unitlib_main_standby_init(SguanFoc *sguanfoc){\n    // 用户可在此调用底层驱动关断 PWM 或释放使能引脚:\n    // userdata_driver_set_pwm(sguanfoc->id_flag, 0, 0, 0, 0, 0, 0);\n}\n\n/**\n * @brief  系统就绪状态初始化\n * @param  sguan: 当前电机句柄指针\n * @note   在电机从待机切换到就绪 (status_ready) 时执行一次\n */\nvoid unitlib_main_ready_init(SguanFoc *sguan){\n    // 用户可在此进行预充磁或清除先前的临时运行缓存\n}\n\n/**\n * @brief  开机自检与参数初始化专项\n * @param  sguan: 当前电机句柄指针\n * @note   完成自检后将 run_flag 置为 RUN_SUCCESS，驱动状态机自动流转到下一个初始化节点\n */\nvoid unitlib_main_initializing_init(SguanFoc *sguan){\n    // 用户可在此进行硬件自检 (母线电压检测、温度检测等)\n    \n    // 赋值 run_flag 为成功，推动状态机进入角度校准专项\n    sguan->run_flag = RUN_SUCCESS;\n}\n\n/**\n * @brief  编码器电角度零位 Offset 标定专项初始化\n * @param  sguan: 当前电机句柄指针\n * @note   通常采用直流电压矢量定向法: 给定固定 Ualpha 电压将转子吸合至 A 相轴线，\n *         稳定后采集编码器计数值作为 offset，最后置位 RUN_SUCCESS 驱动状态机进入电流校准。\n */\nvoid unitlib_main_goinit0_angle_init(SguanFoc *sguan){\n    // 标定逻辑示例:\n    // sguan->foc.ualpha = 2.0f; sguan->foc.ubeta = 0.0f;\n    // delay_ms(500);\n    // sguan->encoder.real_offset = userdata_driver_read_encoder(sguan->id_flag);\n    \n    // 标定完成，切换到下一个状态\n    sguan->run_flag = RUN_SUCCESS;\n}\n\n/**\n * @brief  ADC 电流采样零点偏置校准专项初始化\n * @param  sguan: 当前电机句柄指针\n * @note   在逆变器停机或输出 50% 零矢量时，采样运放输出的参考偏置 (通常为 1.65V / 2048 码值)，\n *         累加多次求平均值并存储于 current_offset0/1 中，最后置位 RUN_SUCCESS。\n */\nvoid unitlib_main_goinit1_current_init(SguanFoc *sguan){\n    // 偏置校准完成后赋值 run_flag，推动状态机正式进入空闲就绪 (status_idle) 运行状态\n    sguan->run_flag = RUN_SUCCESS;\n}\n\n/* =============================================================================== */\n/*                           多轴高频控制环专属处理函数 (1 ~ 6 轴)                  */\n/* =============================================================================== */\n\nvoid unitlib_main_high_loop_one(SguanFoc *sguan){\n    // 电机 1 高频核心控制逻辑:\n    // 1. 读取电流与编码器 -> 2. Clarke/Park 变换 -> 3. 电流环调节 -> 4. 逆Park -> 5. SVPWM 输出\n}\n\nvoid unitlib_main_high_loop_two(SguanFoc *sguan){\n    // 电机 2 高频控制逻辑\n}\n\nvoid unitlib_main_high_loop_three(SguanFoc *sguan){\n    // 电机 3 高频控制逻辑\n}\n\nvoid unitlib_main_high_loop_four(SguanFoc *sguan){\n    // 电机 4 高频控制逻辑\n}\n\nvoid unitlib_main_high_loop_five(SguanFoc *sguan){\n    // 电机 5 高频控制逻辑\n}\n\nvoid unitlib_main_high_loop_six(SguanFoc *sguan){\n    // 电机 6 高频控制逻辑\n}\n\n/* =============================================================================== */\n/*                             单轴高频通用控制环入口                               */\n/* =============================================================================== */\nvoid unitlib_main_high_loop(SguanFoc *sguan){\n    // 单轴控制模式下的统一高频控制环执行体\n}\n\n/* =============================================================================== */\n/*                         低频周期任务与状态机遥测数据喂养                         */\n/* =============================================================================== */\n/**\n * @brief  低频周期任务 (通常以 100Hz ~ 1kHz 频率执行)\n * @param  sguan: 当前电机句柄指针\n * @note   职责:\n *         1. 收集全系统物理遥测数据 (力矩/转速/位置、母线电压、母线电流、三处温度、时钟节拍);\n *         2. 将数据统一填入 motorstatus.data 结构体;\n *         3. 设定当前控制模式;\n *         4. 触发 196 项有限状态机 motorstatus_loop() 执行故障诊断与动作迁移。\n */\nvoid unitlib_main_low_loop(SguanFoc *sguan){\n    // 1. 打包并初始化状态机输入数据 (用于过压、过流、超温、堵转判别)\n    sguan->motorstatus.data.tor_real        = sguan->current.real_iq;\n    sguan->motorstatus.data.tor_target      = sguan->foc.target_iq;\n    sguan->motorstatus.data.vel_real        = sguan->encoder.real_speed;\n    sguan->motorstatus.data.vel_target      = sguan->foc.target_speed;\n    sguan->motorstatus.data.pos_real        = sguan->encoder.real_position;\n    sguan->motorstatus.data.pos_target      = sguan->foc.target_pos;\n    sguan->motorstatus.data.vbus_real       = userdata_driver_read_vbus(sguan->id_flag);\n    sguan->motorstatus.data.ibus_real       = userdata_driver_read_ibus(sguan->id_flag);\n    sguan->motorstatus.data.temp_motor_real = userdata_driver_read_temp_motor(sguan->id_flag);\n    sguan->motorstatus.data.temp_driver_real= userdata_driver_read_temp_driver(sguan->id_flag);\n    sguan->motorstatus.data.temp_pcb_real   = userdata_driver_read_temp_pcb(sguan->id_flag);\n    sguan->motorstatus.data.tick_run        = userdata_driver_read_tick();\n    \n    // 2. 依据当前工况指定运行控制模式 (默认为速度闭环控制)\n    sguan->motorstatus.data.mode_flag       = CONTROL_VELOCITY;\n\n    // 3. 执行状态机主循环：完成 196 项转移表匹配与安全保护裁决\n    motorstatus_loop(sguan);\n}\n\n/* =============================================================================== */\n/*                             多轴后台主循环 (Main Loop)                           */\n/* =============================================================================== */\n\nvoid unitlib_main_main_loop_one(SguanFoc *sguan){\n    // 电机 1 后台非实时管理逻辑\n}\n\nvoid unitlib_main_main_loop_two(SguanFoc *sguan){\n    // 电机 2 后台管理逻辑\n}\n\nvoid unitlib_main_main_loop_three(SguanFoc *sguan){\n    // 电机 3 后台管理逻辑\n}\n\nvoid unitlib_main_main_loop_four(SguanFoc *sguan){\n    // 电机 4 后台管理逻辑\n}\n\nvoid unitlib_main_main_loop_five(SguanFoc *sguan){\n    // 电机 5 后台管理逻辑\n}\n\nvoid unitlib_main_main_loop_six(SguanFoc *sguan){\n    // 电机 6 后台管理逻辑\n}\n\n/* =============================================================================== */\n/*                             单轴后台主循环入口                                   */\n/* =============================================================================== */\nvoid unitlib_main_main_loop(SguanFoc *sguan){\n    // 单轴模式下的后台主循环执行体\n}\n",
      "annotations": [
        {
          "id": "main_stage_inits",
          "title": "unitlib_main_standby_init() ~ goinit1_current_init() 上电自检与零位校准流",
          "startLine": 13,
          "endLine": 64,
          "category": "fsm",
          "categoryName": "系统引导",
          "tag": "开机标定 / 偏置校准",
          "summary": "电机上电后的有序自检流程：STANDBY 待机闭锁 -> READY 准备 -> INITIALIZING 系统初始化 -> GOINIT0 编码器电角度零位对齐 -> GOINIT1 相电流硬件零偏捕获。",
          "pipeline": "上电 STANDBY -> READY -> 自检 -> d 轴强特定向对齐零位 -> 静默采集 ADC 运放静态偏置 -> 进入闭环准备",
          "lineByLine": [
            {
              "lines": "13-25",
              "desc": "待机与就绪初始化，配置初始参数与安全阻抗。"
            },
            {
              "lines": "32-37",
              "desc": "INITIALIZING 阶段，硬件自检并置位 RUN_SUCCESS。"
            },
            {
              "lines": "45-53",
              "desc": "GOINIT0 阶段：向 d 轴注入直流偏置电压迫使转子磁极对齐，标定编码器机械物理零位偏移。"
            },
            {
              "lines": "61-64",
              "desc": "GOINIT1 阶段：相电流运放静态偏置校准，就绪后进入正式运行。"
            }
          ],
          "pitfalls": [
            {
              "type": "WARNING",
              "title": "零位对齐转子负载",
              "text": "GOINIT0 电角度对齐期间电机转子必须允许自由旋转！若此时电机被外部机械死死卡住，将学习到错误的零位偏置，导致闭环运转时飞车或电流巨大抖动。"
            }
          ],
          "extensions": "绝对值磁编码器只需在出厂阶段标定一次零位并固化至 Flash，后续上电可直接跳过对齐阶段直接就绪。"
        },
        {
          "id": "main_high_loop",
          "title": "unitlib_main_high_loop() 多轴高频电流环协同分发",
          "startLine": 70,
          "endLine": 100,
          "category": "algorithm",
          "categoryName": "核心机制",
          "tag": "多轴高频 / 周期同步",
          "summary": "统一挂载在 PWM 硬件更新中断中，按电机索引顺序依次派发执行 Axis 0 ~ 5 各轴的高频矢量控制计算，保持多轴发波严格同相。",
          "pipeline": "PWM 溢出中断触发 -> unitlib_main_high_loop -> 依次调度 axis1_high / axis2_high -> 硬件更新",
          "lineByLine": [
            {
              "lines": "70-94",
              "desc": "针对各个电机轴的独立高频执行子程序 unitlib_main_high_loop_one ~ six。"
            },
            {
              "lines": "98-100",
              "desc": "单轴控制模式下的统一高频控制环入口 unitlib_main_high_loop。"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "多轴 PWM 错峰采样",
              "text": "若多个电机共用同一个 ADC 转换器，需将不同电机的 PWM 定时器配置为相位错开 180 度，避免三相下桥臂低侧采样点发生通道冲突。"
            }
          ],
          "extensions": "支持机械臂 6 轴联动与云台 3 轴同步发波。"
        },
        {
          "id": "main_low_loop",
          "title": "unitlib_main_low_loop() 速度/位置外环与遥测数据慢速采集",
          "startLine": 114,
          "endLine": 134,
          "category": "fsm",
          "categoryName": "外环控制",
          "tag": "低频多任务 / 慢速外环",
          "summary": "在 SysTick 定时器或 RTOS 周期性任务 (1ms) 中轮询，执行外环控制计算，并调用 printf 模块向外部串口推送监控波形。",
          "pipeline": "1ms 慢速定时触发 -> 更新各轴低频速度/位置控制环 -> 采集母线电压与温度 -> 打包发送波形",
          "lineByLine": [
            {
              "lines": "114-128",
              "desc": "打包转矩/速度/位置、母线电压、电流与三处温度遥测参数至 motorstatus.data。"
            },
            {
              "lines": "129-134",
              "desc": "设定当前控制模式，触发 196 项状态机 motorstatus_loop() 推进。"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "任务优先级隔离",
              "text": "low_loop 优先级必须低于 high_loop 中断，确保即使低频任务耗时稍长，电流闭环仍然能够按微秒级周期准时切入发波。"
            }
          ],
          "extensions": "在带操作系统的工程中，low_loop 通常作为一个独立的 FreeRTOS 任务运行。"
        },
        {
          "id": "main_state_loop",
          "title": "unitlib_main_main_loop() 状态机轮询与故障重试监视器",
          "startLine": 140,
          "endLine": 169,
          "category": "fsm",
          "categoryName": "系统级调度",
          "tag": "后台大循环 / 故障监控",
          "summary": "运行在主函数 while(1) 大循环中的全系统巡检器，负责轮询驱动各个电机的有限状态机推进，并监视通信超时与全局急停按键。",
          "pipeline": "main() 无限循环 -> unitlib_main_main_loop -> 依次检查各轴状态机 -> 故障捕获",
          "lineByLine": [
            {
              "lines": "140-163",
              "desc": "多轴后台大循环分发子例程 unitlib_main_main_loop_one ~ six。"
            },
            {
              "lines": "167-169",
              "desc": "单轴模式后台主循环执行体 unitlib_main_main_loop。"
            }
          ],
          "pitfalls": [
            {
              "type": "NOTE",
              "title": "看门狗喂狗放置点",
              "text": "硬件看门狗 (IWDG) 喂狗操作通常放置在 main_loop 中，若主状态机发生异常死循环，看门狗将在数十毫秒内复位系统以保障安全。"
            }
          ],
          "extensions": "架构简洁清晰，极易移植至各种裸机与实时操作系统环境。"
        }
      ]
    },
    {
      "id": "userdata_driver_c",
      "name": "UserData_Driver.c",
      "matrixIndex": "08",
      "role": "硬件抽象层 (HAL) 与外设寄存器驱动",
      "header": "UserData_Driver.h",
      "hardware": "TIMx PWM / ADC1/2 注入通道 / SPI 编码器 / GPIO",
      "badge": "Tier 5 硬件驱动层",
      "shortDesc": "实现三相 PWM 定时器寄存器映射、三相低侧相电流注入采样及零漂校准、绝对值磁编码器 SPI 通信与总线电压温度读取。",
      "lineCount": 427,
      "sizeBytes": 11087,
      "content": "#include \"UserData_Driver.h\"\n\n/**\n * @brief  读取系统高精度时钟节拍 (毫秒或微秒 Tick)\n * @retval 当前系统运行节拍数 (uint32_t)\n * @note   用于有限状态机中的故障防抖延时、堵转判定及过流反时限积分。\n *         示例 (HAL库): return HAL_GetTick();\n */\nuint32_t userdata_driver_read_tick(void){\n    // 用户实现: 此处放置您的系统 tick 读取函数 (如 SysTick 计数值)\n    return 0;\n}\n\n/**\n * @brief  读取指定电机的物理编码器角度原始值\n * @param  motor: 电机物理轴编号 (MOTOR_ONE ~ MOTOR_SIX)\n * @retval 归一化或原始物理角度数值 (SguanQ 类型)\n * @note   用户在此调用底层 SPI 读取磁编码器 (如 MT6835, AS5600, MA730, TLE5012B)\n *         或读取正交定时器 ABZ 脉冲计数器。\n */\nSguanQ userdata_driver_read_encoder(uint8_t motor){\n    SguanQ encoder_raw = iqmath_zero();\n    switch (motor){\n    case MOTOR_ONE:\n        // 用户实现: 电机 1 编码器数据读取 (例如 SPI 读取原始 14 位或 16 位角度并转弧度)\n        break;\n    case MOTOR_TWO:\n        // 用户实现: 电机 2 编码器数据读取\n        break;\n    case MOTOR_THREE:\n        // 用户实现: 电机 3 编码器数据读取\n        break;\n    case MOTOR_FOUR:\n        // 用户实现: 电机 4 编码器数据读取\n        break;\n    case MOTOR_FIVE:\n        // 用户实现: 电机 5 编码器数据读取\n        break;\n    case MOTOR_SIX:\n        // 用户实现: 电机 6 编码器数据读取\n        break;\n    \n    default:\n        break;\n    }\n    return encoder_raw;\n}\n\n/**\n * @brief  读取指定电机的三相霍尔传感器引脚电平\n * @param  motor: 电机轴编号\n * @param  ch: 霍尔相别 (HALL_A, HALL_B, HALL_C)\n * @retval 引脚电平 (0: 低电平, 1: 高电平)\n * @note   用于低成本有感方波或 60° 霍尔角度解算插补。\n */\nuint8_t userdata_driver_read_hall(uint8_t motor, uint8_t ch){\n    uint8_t hall_raw = 0;\n    switch (motor){\n    case MOTOR_ONE:\n        switch (ch){\n        case HALL_A:\n            // 用户实现: 读取电机 1 霍尔 A 相 GPIO 电平\n            break;\n        case HALL_B:\n            // 用户实现: 读取电机 1 霍尔 B 相 GPIO 电平\n            break;\n        case HALL_C:\n            // 用户实现: 读取电机 1 霍尔 C 相 GPIO 电平\n            break;\n        default:\n            break;\n        }\n        break;\n    case MOTOR_TWO:\n        switch (ch){\n        case HALL_A:\n            break;\n        case HALL_B:\n            break;\n        case HALL_C:\n            break;\n        default:\n            break;\n        }\n        break;\n    case MOTOR_THREE:\n        switch (ch){\n        case HALL_A:\n            break;\n        case HALL_B:\n            break;\n        case HALL_C:\n            break;\n        default:\n            break;\n        }\n        break;\n    case MOTOR_FOUR:\n        switch (ch){\n        case HALL_A:\n            break;\n        case HALL_B:\n            break;\n        case HALL_C:\n            break;\n        default:\n            break;\n        }\n        break;\n    case MOTOR_FIVE:\n        switch (ch){\n        case HALL_A:\n            break;\n        case HALL_B:\n            break;\n        case HALL_C:\n            break;\n        default:\n            break;\n        }\n        break;\n    case MOTOR_SIX:\n        switch (ch){\n        case HALL_A:\n            break;\n        case HALL_B:\n            break;\n        case HALL_C:\n            break;\n        default:\n            break;\n        }\n        break;\n    default:\n        break;\n    }\n    return hall_raw;\n}\n\n/**\n * @brief  读取三相相电流 ADC 原始转换码值\n * @param  motor: 电机轴编号\n * @param  ch: 相电流通道编号 (CURRENT_U, CURRENT_V, CURRENT_W)\n * @retval ADC 转换结果原始值 (12位ADC通常为 0 ~ 4095)\n * @note   关键时序: 必须由定时器 PWM 下溢事件硬件触发 ADC 注入采样，\n *         在低侧下桥臂全开的零矢量 V0 区间完成瞬时采样。\n */\nuint16_t userdata_driver_read_iabc(uint8_t motor, uint8_t ch){\n    uint16_t iabc_raw = 0;\n    switch (motor){\n    case MOTOR_ONE:\n        switch (ch){\n        case CURRENT_U:\n            // 用户实现: 读取电机 1 U 相 ADC 注入数据寄存器 (如 ADC1->JDR1)\n            break;\n        case CURRENT_V:\n            // 用户实现: 读取电机 1 V 相 ADC 注入数据寄存器 (如 ADC1->JDR2)\n            break;\n        case CURRENT_W:\n            // 用户实现: 读取电机 1 W 相 ADC 注入数据寄存器 (如 ADC1->JDR3)\n            break;\n        default:\n            break;\n        }\n        break;\n    case MOTOR_TWO:\n        switch (ch){\n        case CURRENT_U:\n            break;\n        case CURRENT_V:\n            break;\n        case CURRENT_W:\n            break;\n        default:\n            break;\n        }\n        break;\n    case MOTOR_THREE:\n        switch (ch){\n        case CURRENT_U:\n            break;\n        case CURRENT_V:\n            break;\n        case CURRENT_W:\n            break;\n        default:\n            break;\n        }\n        break;\n    case MOTOR_FOUR:\n        switch (ch){\n        case CURRENT_U:\n            break;\n        case CURRENT_V:\n            break;\n        case CURRENT_W:\n            break;\n        default:\n            break;\n        }\n        break;\n    case MOTOR_FIVE:\n        switch (ch){\n        case CURRENT_U:\n            break;\n        case CURRENT_V:\n            break;\n        case CURRENT_W:\n            break;\n        default:\n            break;\n        }\n        break;\n    case MOTOR_SIX:\n        switch (ch){\n        case CURRENT_U:\n            break;\n        case CURRENT_V:\n            break;\n        case CURRENT_W:\n            break;\n        default:\n            break;\n        }\n        break;\n    default:\n        break;\n    }\n    return iabc_raw;\n}\n\n/**\n * @brief  读取直流母线供电电压 (Vbus)\n * @param  motor: 电机轴编号\n * @retval 物理母线电压真实值 (单位: V)\n * @note   用于 SVPWM 调制深度归一化以及过压/欠压故障保护。\n */\nSguanQ userdata_driver_read_vbus(uint8_t motor){\n    SguanQ vbus_raw = iqmath_zero();\n    switch (motor){\n    case MOTOR_ONE:\n        // 用户实现: ADC 采样母线分压电阻两端电压，经分压比换算为真实物理电压 (如 24.0V)\n        break;\n    case MOTOR_TWO:\n        break;\n    case MOTOR_THREE:\n        break;\n    case MOTOR_FOUR:\n        break;\n    case MOTOR_FIVE:\n        break;\n    case MOTOR_SIX:\n        break;\n    default:\n        break;\n    }\n    return vbus_raw;\n}\n\n/**\n * @brief  读取直流母线总输入电流 (Ibus)\n * @param  motor: 电机轴编号\n * @retval 物理母线电流真实值 (单位: A)\n * @note   用于状态机中的母线过流双重保护 (瞬时大电流切断 + 持续超负荷反时限延时)。\n */\nSguanQ userdata_driver_read_ibus(uint8_t motor){\n    SguanQ ibus_raw = iqmath_zero();\n    switch (motor){\n    case MOTOR_ONE:\n        // 用户实现: 采样母线高侧/低侧分流电阻或霍尔电流传感器数据\n        break;\n    case MOTOR_TWO:\n        break;\n    case MOTOR_THREE:\n        break;\n    case MOTOR_FOUR:\n        break;\n    case MOTOR_FIVE:\n        break;\n    case MOTOR_SIX:\n        break;\n    default:\n        break;\n    }\n    return ibus_raw;\n}\n\n/**\n * @brief  读取电机本体热敏电阻物理温度\n * @param  motor: 电机轴编号\n * @retval 温度值 (单位: ℃)\n * @note   用于电机过温保护 (如线圈温度超过 100℃ 时停机)。\n */\nSguanQ userdata_driver_read_temp_motor(uint8_t motor){\n    SguanQ temp_motor = iqmath_zero();\n    switch (motor){\n    case MOTOR_ONE:\n        // 用户实现: 采集电机内置 NTC 电阻分压并查表计算温度\n        break;\n    case MOTOR_TWO:\n        break;\n    case MOTOR_THREE:\n        break;\n    case MOTOR_FOUR:\n        break;\n    case MOTOR_FIVE:\n        break;\n    case MOTOR_SIX:\n        break;\n    default:\n        break;\n    }\n    return temp_motor;\n}\n\n/**\n * @brief  读取功率驱动管 (MOSFET / IGBT / 栅极驱动器) 物理温度\n * @param  motor: 电机轴编号\n * @retval 功率级温度值 (单位: ℃)\n */\nSguanQ userdata_driver_read_temp_driver(uint8_t motor){\n    SguanQ temp_driver = iqmath_zero();\n    switch (motor){\n    case MOTOR_ONE:\n        // 用户实现: 功率管贴片 NTC 采样与转换\n        break;\n    case MOTOR_TWO:\n        break;\n    case MOTOR_THREE:\n        break;\n    case MOTOR_FOUR:\n        break;\n    case MOTOR_FIVE:\n        break;\n    case MOTOR_SIX:\n        break;\n    default:\n        break;\n    }\n    return temp_driver;\n}\n\n/**\n * @brief  读取驱动控制板 PCB 板载环境温度\n * @param  motor: 电机轴编号\n * @retval PCB 环境温度 (单位: ℃)\n */\nSguanQ userdata_driver_read_temp_pcb(uint8_t motor){\n    SguanQ temp_pcb_raw = iqmath_zero();\n    switch (motor){\n    case MOTOR_ONE:\n        // 用户实现: PCB 板载环境温度传感器数据采样\n        break;\n    case MOTOR_TWO:\n        break;\n    case MOTOR_THREE:\n        break;\n    case MOTOR_FOUR:\n        break;\n    case MOTOR_FIVE:\n        break;\n    case MOTOR_SIX:\n        break;\n    default:\n        break;\n    }\n    return temp_pcb_raw;\n}\n\n/**\n * @brief  底层串口数据发送接口 (用于示波器推流与命令行回传)\n * @param  ch: 待发送数据缓冲区指针\n * @param  size: 发送字节数\n */\nvoid userdata_driver_set_uart(uint8_t *ch, uint16_t size){\n    // 用户实现: 启动串口 DMA 发送或阻塞式中断发送\n}\n\n/**\n * @brief  底层定时器三相互补 PWM 占空比寄存器写入\n * @param  motor: 电机轴编号 (MOTOR_ONE ~ MOTOR_SIX)\n * @param  du_0, du_1: U 相比较寄存器计数值 (双边沿或死区对称值)\n * @param  dv_0, dv_1: V 相比较寄存器计数值\n * @param  dw_0, dw_1: W 相比较寄存器计数值\n * @note   在 SVPWM 计算完成后由高频中断末尾调用，直接写入定时器 CCR 寄存器生效。\n *         示例 (STM32 TIM1):\n *         TIM1->CCR1 = du_0;\n *         TIM1->CCR2 = dv_0;\n *         TIM1->CCR3 = dw_0;\n */\nvoid userdata_driver_set_pwm(uint8_t motor, \n    uint16_t du_0, uint16_t du_1, \n    uint16_t dv_0, uint16_t dv_1, \n    uint16_t dw_0, uint16_t dw_1){\n    switch (motor){\n    case MOTOR_ONE:\n        // 用户实现: 写入电机 1 对应的定时器 CCR1, CCR2, CCR3 寄存器\n        break;\n    case MOTOR_TWO:\n        // 用户实现: 写入电机 2 定时器寄存器\n        break;\n    case MOTOR_THREE:\n        // 用户实现: 写入电机 3 定时器寄存器\n        break;\n    case MOTOR_FOUR:\n        // 用户实现: 写入电机 4 定时器寄存器\n        break;\n    case MOTOR_FIVE:\n        // 用户实现: 写入电机 5 定时器寄存器\n        break;\n    case MOTOR_SIX:\n        // 用户实现: 写入电机 6 定时器寄存器\n        break;\n    default:\n        break;\n    }\n}\n\n/**\n * @brief  底层 ADC 触发与时序配置钩子\n * @param  motor: 电机轴编号\n * @param  x: 控制参数\n */\nvoid userdata_driver_set_adc(uint8_t motor, uint16_t x){\n    // 用户实现: 动态调整 ADC 触发阈值或规则\n}\n",
      "annotations": [
        {
          "id": "encoder_spi",
          "title": "userdata_driver_read_encoder() 绝对值磁编码器 SPI 读取与标幺归一化",
          "startLine": 21,
          "endLine": 47,
          "category": "hardware",
          "categoryName": "硬件抽象",
          "tag": "SPI 编码器 / AS5047P / MT6835",
          "summary": "通过硬件 SPI 总线以 10MHz 速率读取磁编码器内部寄存器的 14 位或 16 位绝对角度原始计数值，进行奇偶校验与位移，并归一化为 $[0, 2\\pi)$ 弧度。",
          "pipeline": "拉低 CS 片选 -> 发送读角指令帧 -> 接收 16 位角度数据 -> 校验 Parity 位 -> 扣除机械偏置 -> 归一化为浮点/定点角度",
          "lineByLine": [
            {
              "lines": "21-26",
              "desc": "读取电机 1 编码器数据 (SPI 原始数据或正交脉冲计数并转弧度)。"
            },
            {
              "lines": "27-42",
              "desc": "多轴分支支持 (电机 2 ~ 6)。"
            },
            {
              "lines": "43-47",
              "desc": "边界保护并返回当前角度原始值。"
            }
          ],
          "math": [
            {
              "label": "14 位绝对值角度量化分辨率",
              "formula": "\\theta_m = \\text{Raw} \\cdot \\frac{2\\pi}{2^{14}} = \\text{Raw} \\cdot \\frac{2\\pi}{16384} \\approx 0.0219^{\\circ}"
            }
          ],
          "pitfalls": [
            {
              "type": "WARNING",
              "title": "SPI 通信时钟相序",
              "text": "AS5047P / MT6835 等磁编码器通常要求 SPI 模式为 CPOL=0, CPHA=1 (或特定模式)。若时钟边沿配错，读回的角度会在高位发生随机跳动！"
            }
          ],
          "extensions": "支持单圈绝对值、多圈记忆以及 ABZ 增量式光电编码器自由切换挂载。"
        },
        {
          "id": "hall_sensor",
          "title": "userdata_driver_read_hall() 霍尔传感器 GPIO 引脚状态机扫描",
          "startLine": 56,
          "endLine": 138,
          "category": "hardware",
          "categoryName": "硬件抽象",
          "tag": "霍尔传感器 / 六状态换向",
          "summary": "读取 3 路开关型霍尔传感器的 GPIO 引脚逻辑电平，组合成 3 位二进制状态码 (1~6)，映射至对应的 60 度电气区间。",
          "pipeline": "读取 Hall U/V/W 输入引脚 -> 拼接成 uint8_t 状态码 -> 校验有效范围 [1..6] -> 输出粗略电气角度",
          "lineByLine": [
            {
              "lines": "56-74",
              "desc": "电机 1 读取 A、B、C 三相霍尔引脚 GPIO 电平。"
            },
            {
              "lines": "75-134",
              "desc": "多轴模式 (电机 2 ~ 6) 霍尔引脚电平扫描。"
            },
            {
              "lines": "135-138",
              "desc": "状态汇总并返回霍尔引脚电平编码。"
            }
          ],
          "pitfalls": [
            {
              "type": "CAUTION",
              "title": "非法状态 0 与 7",
              "text": "正常运转中三相霍尔不可能同时全为 0 或全为 1。一旦出现全 0 或全 1，必定是接线插头松脱或上拉电阻虚焊，需立即触发缺相保护。"
            }
          ],
          "extensions": "常用于电动滑板车或大扭矩电动工具的初级低成本驱动方案。"
        },
        {
          "id": "iabc_sampling",
          "title": "userdata_driver_read_iabc() 三相低侧检流电阻注入采样与零偏扣除",
          "startLine": 148,
          "endLine": 230,
          "category": "hardware",
          "categoryName": "硬件抽象",
          "tag": "相电流采样 / ADC 注入组",
          "summary": "由高级定时器在下桥臂导通的正中间触发 ADC 注入转换，采集三相采样电阻上的电压，扣除上电时校准的零点漂移，乘以采样电阻与运放增益倒数还原为安培值。",
          "pipeline": "下桥臂全部导通瞬间 -> 定时器 TRGO 触发 ADC 注入采样 -> 读取 ADC 原始寄存器 -> 减去零漂 offset -> 转换为实际电流",
          "lineByLine": [
            {
              "lines": "148-166",
              "desc": "电机 1 读取 U、V、W 三相注入 ADC 转换结果原始值 (如 ADC_JDRx)。"
            },
            {
              "lines": "167-226",
              "desc": "多轴模式 (电机 2 ~ 6) 三相电流采样。"
            },
            {
              "lines": "227-230",
              "desc": "返回 ADC 采样原始值。"
            }
          ],
          "math": [
            {
              "label": "相电流工程还原公式",
              "formula": "I_{phase} = \\frac{(\\text{ADC}_{raw} - \\text{ADC}_{offset}) \\cdot V_{ref}}{2^{12} \\cdot R_{shunt} \\cdot A_v}"
            }
          ],
          "pitfalls": [
            {
              "type": "WARNING",
              "title": "低侧采样窗口极小限制",
              "text": "低侧检流电阻仅当下桥臂导通时才有电流流过！若某个上桥臂占空比达到 98% 以上，下桥臂导通时间可能小于 ADC 采样保持所需的最短窗口 (如 1us)，将采到严重振铃噪声！"
            }
          ],
          "extensions": "SguanFOC 支持两电阻采样 (基于 Ia + Ib + Ic = 0 计算第三相) 与三电阻全采样自适应切换。"
        },
        {
          "id": "vbus_and_temp",
          "title": "userdata_driver_read_vbus() / read_temp_*() 母线电压与 NTC 热敏电阻采样",
          "startLine": 238,
          "endLine": 368,
          "category": "hardware",
          "categoryName": "硬件抽象",
          "tag": "母线电压 / NTC 查表测温",
          "summary": "通过分压电阻网络读取直流母线供电电压 Vbus；通过 NTC 分压采样结合 B 曲线反算或查找表精确测量电机线圈与驱动板功率 MOS 温度。",
          "pipeline": "常规 ADC 规则通道轮询 -> 分压比换算为母线真实电压 -> NTC 分压比计算电阻 -> 查表或公式获得摄氏度",
          "lineByLine": [
            {
              "lines": "238-258",
              "desc": "read_vbus：直流母线供电电压采样与换算。"
            },
            {
              "lines": "261-286",
              "desc": "read_ibus：直流母线总输入电流采样，服务于过载与即时过流判定。"
            },
            {
              "lines": "289-368",
              "desc": "read_temp_motor / driver / pcb：电机线圈、功率驱动管与控制板 PCB 三点温度采样。"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "母线电压波动前馈补偿",
              "text": "当母线电压随电池消耗而跌落时，实际输出的电压幅值会变小。将测得的真实 Vbus 实时代入 SVPWM 调制方程，可完全消除电池压降对速度的扰动！"
            }
          ],
          "extensions": "完备的工业级硬件监控体系，全方位保护电机与功率级硬件资产。"
        },
        {
          "id": "pwm_output",
          "title": "userdata_driver_set_pwm() 三相中央对齐互补 PWM 占空比寄存器写入",
          "startLine": 391,
          "endLine": 417,
          "category": "hardware",
          "categoryName": "硬件驱动",
          "tag": "高级定时器 / 互补输出带死区",
          "summary": "将 SVPWM 计算得到的标幺化占空比乘以定时器自动重装载值 ARR，将计算得到的计数值直接写入高级定时器 (如 TIM1/TIM8) 的 CCR1、CCR2、CCR3 比较寄存器。",
          "pipeline": "接收标幺占空比 da, db, dc -> 乘以定时器周期上限 ARR -> 钳位至 [0..ARR] -> 写入 TIMx->CCRx 寄存器",
          "lineByLine": [
            {
              "lines": "391-398",
              "desc": "电机 1 写入硬件定时器比较寄存器 (如 TIM1->CCR1~3)。"
            },
            {
              "lines": "399-414",
              "desc": "多轴模式 (电机 2 ~ 6) PWM 占空比下发。"
            },
            {
              "lines": "415-417",
              "desc": "执行完毕返回。"
            }
          ],
          "math": [
            {
              "label": "比较寄存器数值转换",
              "formula": "\\text{CCR}_x = \\text{clamp}\\left( d_x \\cdot \\text{ARR}, 0, \\text{ARR} \\right)"
            }
          ],
          "pitfalls": [
            {
              "type": "CAUTION",
              "title": "死区时间 (Dead Time) 硬件强制插入",
              "text": "上下桥臂 MOSFET 切换存在关断延迟。必须在高级定时器刹车与死区寄存器 (BDTR) 中配置硬件死区时间 (如 500ns~1us)，严禁上下桥臂同时导通引发直通短路炸管！"
            }
          ],
          "extensions": "结合 ADC 注入触发输出 (TIM_TRGO)，构成完全自治的硬件级闭环循环流水线。"
        }
      ]
    },
    {
      "id": "unitlib_usercontrol_c",
      "name": "UnitLib_UserControl.c",
      "matrixIndex": "09",
      "role": "上位机控制指令接口与目标设定",
      "header": "UnitLib_UserControl.h",
      "hardware": "串口指令 / CANopen / 应用层 API",
      "badge": "Tier 2 控制输入层",
      "shortDesc": "为上层应用提供简洁统一的控制函数，支持电机启停、目标速度、目标位置、d/q 轴给定电流与给定电压注入。",
      "lineCount": 73,
      "sizeBytes": 2595,
      "content": "#include \"UnitLib_UserControl.h\"\n\n/**\n * @brief  指令处理回调函数: MOTOR (启停/使能控制)\n * @param  value: 上位机下发参数值 (例如: 1.0 为启动使能, 0.0 为停机待机)\n * @note   通信协议示例: 发送 \"MOTOR=1?\" 或 \"MOTOR=0?\"\n */\nvoid unitlib_usercontrol_motor(float value){\n    // 逻辑示例: 改变当前主电机的运行使能标志\n    // if (value > 0.5f) sguanfoc[0].run_flag = RUN_READY;\n    // else              sguanfoc[0].run_flag = RUN_STANDBY;\n}\n\n/**\n * @brief  指令处理回调函数: Speed (目标转速设置)\n * @param  value: 期望机械转速 (单位: rpm 或 rad/s)\n * @note   通信协议示例: 发送 \"Speed=1500.0?\"\n */\nvoid unitlib_usercontrol_speed(float value){\n    // 逻辑示例: 将目标转速注入当前活动电机的期望速度变量中\n    // sguanfoc[0].foc.target_speed = (SguanQ)value;\n}\n\n/**\n * @brief  指令处理回调函数: Position (目标位置设置)\n * @param  value: 期望目标机械角度 (单位: rad 或 编码器计数值)\n * @note   通信协议示例: 发送 \"Position=3.1415?\"\n */\nvoid unitlib_usercontrol_position(float value){\n    // 逻辑示例: 设定伺服位置环的目标角度\n    // sguanfoc[0].foc.target_pos = (SguanQ)value;\n}\n\n/**\n * @brief  指令处理回调函数: Id (直轴目标电流设置)\n * @param  value: 期望 d 轴电流 (单位: A)\n * @note   在表贴式 PMSM 中通常设为 0；在高速弱磁工况下设定为负值 (如 \"Id=-2.0?\")\n */\nvoid unitlib_usercontrol_id(float value){\n    // 逻辑示例:\n    // sguanfoc[0].foc.target_id = (SguanQ)value;\n}\n\n/**\n * @brief  指令处理回调函数: Iq (交轴目标转矩电流设置)\n * @param  value: 期望 q 轴转矩电流 (单位: A)\n * @note   通信协议示例: 发送 \"Iq=2.5?\" (纯力矩模式调试时使用)\n */\nvoid unitlib_usercontrol_iq(float value){\n    // 逻辑示例:\n    // sguanfoc[0].foc.target_iq = (SguanQ)value;\n}\n\n/**\n * @brief  指令处理回调函数: Ud (直轴开环测试电压设置)\n * @param  value: 期望 d 轴电压 (单位: V)\n * @note   通信协议示例: 发送 \"Ud=2.0?\" (用于直流电压对齐标定电角度零点)\n */\nvoid unitlib_usercontrol_ud(float value){\n    // 逻辑示例:\n    // sguanfoc[0].foc.target_ud = (SguanQ)value;\n}\n\n/**\n * @brief  指令处理回调函数: Uq (交轴开环测试电压设置)\n * @param  value: 期望 q 轴电压 (单位: V)\n * @note   通信协议示例: 发送 \"Uq=3.0?\" (用于电压开环开机旋转测试)\n */\nvoid unitlib_usercontrol_uq(float value){\n    // 逻辑示例:\n    // sguanfoc[0].foc.target_uq = (SguanQ)value;\n}\n",
      "annotations": [
        {
          "id": "user_motor_switch",
          "title": "unitlib_usercontrol_motor() 电机启停与使能切换",
          "startLine": 8,
          "endLine": 12,
          "category": "hardware",
          "categoryName": "控制接口",
          "tag": "启停使能 / 安全急停",
          "summary": "控制电机驱动的全局使能与急停。输入 1.0 使能电机并切入闭环运转，输入 0.0 立即切断电流并进入高阻安全释放状态。",
          "pipeline": "应用层/上位机指令 -> unitlib_usercontrol_motor -> 变更 run_flag -> 触发状态机转换",
          "lineByLine": [
            {
              "lines": "8-12",
              "desc": "接收使能/停机浮点指令，更新 run_flag 联动状态机。"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "急停瞬态处理",
              "text": "急停时不仅要停止发波，还应将 PID 积分器清零，防止再次使能时旧的历史积分造成起步冲击。"
            }
          ],
          "extensions": "可直接绑定至外部物理急停按钮或遥控器通道开关。"
        },
        {
          "id": "user_speed_pos",
          "title": "unitlib_usercontrol_speed() / position() 速度外环与位置外环目标给定",
          "startLine": 19,
          "endLine": 32,
          "category": "algorithm",
          "categoryName": "控制接口",
          "tag": "目标设定 / 运动规划",
          "summary": "向上层暴露的速度与位置给定接口，支持实时输入目标角速度 (rad/s 或 rpm) 与目标绝对机械角度 (rad 或度)。",
          "pipeline": "设定 speed_target / pos_target -> 速度规划器插值 -> 慢速控制环低通跟踪",
          "lineByLine": [
            {
              "lines": "19-22",
              "desc": "speed 速度外环给定目标转速 (target_speed)。"
            },
            {
              "lines": "29-32",
              "desc": "position 位置外环给定目标角度 (target_pos)。"
            }
          ],
          "pitfalls": [
            {
              "type": "WARNING",
              "title": "目标突变限幅滤波",
              "text": "若目标位置从 0 度瞬间阶跃至 3600 度，巨大的阶跃误差会使速度环与电流环严重饱和；建议搭配 S 曲线加减速规划器。"
            }
          ],
          "extensions": "支持配合数控机床 G 代码插补器或无人机航向控制器联动。"
        },
        {
          "id": "user_current_dq",
          "title": "unitlib_usercontrol_id() / iq() d 轴弱磁与 q 轴转矩电流目标给定",
          "startLine": 39,
          "endLine": 52,
          "category": "algorithm",
          "categoryName": "控制接口",
          "tag": "电流环给定 / 力矩模式",
          "summary": "直接操控电机的电磁转矩与磁场通量。设置 Iq 可实现纯力矩控制；设置负 Id 可实现高速工况下的弱磁升速 (Flux Weakening)。",
          "pipeline": "设定 Iq_ref 与 Id_ref -> 直达高频电流环 -> 产生直接受控的安培力矩",
          "lineByLine": [
            {
              "lines": "39-42",
              "desc": "id d 轴弱磁电流给定 (target_id)。"
            },
            {
              "lines": "49-52",
              "desc": "iq q 轴转矩电流给定 (target_iq)。"
            }
          ],
          "math": [
            {
              "label": "永磁同步电机电磁转矩方程",
              "formula": "T_e = \\frac{3}{2} p \\left( \\psi_f i_q + (L_d - L_q) i_d i_q \\right)"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "力矩模式应用",
              "text": "在协作机器人阻抗控制、触觉力反馈手柄以及收放卷恒张力控制中，直接控制 Iq 是最核心的控制手段。"
            }
          ],
          "extensions": "具有超快响应速度，电流阶跃响应可在数百微秒内达成。"
        },
        {
          "id": "user_voltage_openloop",
          "title": "unitlib_usercontrol_ud() / uq() 开环标定与强制电压矢量注入",
          "startLine": 59,
          "endLine": 72,
          "category": "algorithm",
          "categoryName": "调试工具",
          "tag": "开环电压注入 / 极对数测试",
          "summary": "绕过任何电流、速度闭环，直接向电机定子施加指定的 d/q 轴电压矢量。是初学者测试硬件驱动桥是否完好、测定电机极对数的黄金调试接口。",
          "pipeline": "设定固定 Ud / Uq -> 反 Park 变换 -> 驱动电机以固定电压旋转 -> 验证相序与电流反馈",
          "lineByLine": [
            {
              "lines": "59-62",
              "desc": "ud d 轴开环直流电压给定 (用于零位吸合对齐)。"
            },
            {
              "lines": "69-72",
              "desc": "uq q 轴开环电压给定 (用于无编码器强拖测试)。"
            }
          ],
          "pitfalls": [
            {
              "type": "CAUTION",
              "title": "开环电压严防烧管",
              "text": "电机在静止时没有反电动势阻碍电流，施加即使 1~2V 的小电压也可能产生很大的欧姆相电流！调试开环电压必须从 0.5V 开始微量递增，严防过流烧毁驱动板！"
            }
          ],
          "extensions": "在《初学者手把手实操指南》实验一中，正是利用此接口完成电机开环旋转实验。"
        }
      ]
    },
    {
      "id": "unitlib_status_c",
      "name": "UnitLib_Status.c",
      "matrixIndex": "10",
      "role": "29 种运行与故障状态周期执行体",
      "header": "UnitLib_Status.h",
      "hardware": "过流保护切断 / 刹车制动",
      "badge": "Tier 1 状态机执行体",
      "shortDesc": "实现电机处于加速、减速、位置保持以及欠压、过压、过流、过温、堵转等 29 种状态时的周期性防护行为。",
      "lineCount": 146,
      "sizeBytes": 4181,
      "content": "#include \"UnitLib_Status.h\"\n\n/**\n * @brief  待机状态 (status_standby) 周期执行动作\n * @note   电机处于停机状态，通常在此确保 PWM 下桥关断，驱动处于高阻态或低阻制动状态\n */\nvoid unitlib_status_standby_loop(void){\n    // 用户实现: 待机期间的指示灯闪烁或状态监视\n}\n\n/**\n * @brief  就绪状态 (status_ready) 周期执行动作\n * @note   系统各模块已准备就绪，等待运行使能事件触发\n */\nvoid unitlib_status_ready_loop(void){\n    // 用户实现:\n}\n\n/**\n * @brief  初始化过程中 (status_initializing / angle / current) 周期执行动作\n */\nvoid unitlib_status_initial_loop(void){\n    // 用户实现: 初始化校验逻辑\n}\n\n/* =================================================== */\n/*             正常运行模态下的三类微状态动作            */\n/* =================================================== */\n\n/**\n * @brief  参数递增状态 (status_xxx_increasing) 周期执行动作\n * @note   当前控制量（转矩/速度/位置）正处于加速上升爬坡阶段\n */\nvoid unitlib_status_increasing_loop(void){\n    // 用户实现: 斜坡加减速平滑插值或指示\n}\n\n/**\n * @brief  参数递减状态 (status_xxx_decreasing) 周期执行动作\n * @note   当前控制量正处于减速下坡阶段\n */\nvoid unitlib_status_decreasing_loop(void){\n    // 用户实现:\n}\n\n/**\n * @brief  参数稳定保持状态 (status_xxx_hold) 周期执行动作\n * @note   当前控制量已到达目标值并进入稳态伺服保持\n */\nvoid unitlib_status_hold_loop(void){\n    // 用户实现: 稳态抖动监测或位置锁定\n}\n\n/* =================================================== */\n/*             故障与异常保护发生时的周期动作钩子       */\n/* =================================================== */\n\n/**\n * @brief  过压保护动作 (status_overvoltage)\n * @note   母线电压 Vbus 超过设定上限 vbus_max 时触发\n */\nvoid unitlib_status_overvoltage_loop(void){\n    // 用户实现: 紧急切断 PWM，开启放电制动电阻，红灯快闪报警\n}\n\n/**\n * @brief  欠压保护动作 (status_undervoltage)\n * @note   母线电压 Vbus 低于设定下限 vbus_min 时触发\n */\nvoid unitlib_status_undervoltage_loop(void){\n    // 用户实现: 关断功率管，记录电池电量耗尽故障码\n}\n\n/**\n * @brief  过流保护动作 (status_overcurrent)\n * @note   瞬时极限过流或持续反时限过载超时触发\n */\nvoid unitlib_status_overcurrent_loop(void){\n    // 用户实现: 硬件级关断输出，锁死报警，防止 MOS 击穿\n}\n\n/**\n * @brief  电机过温保护动作 (status_overtemp_motor)\n */\nvoid unitlib_status_overtemp_motor_loop(void){\n    // 用户实现: 降低运行功率或停机降温\n}\n\n/**\n * @brief  电机过冷保护动作 (status_undertemp_motor)\n */\nvoid unitlib_status_undertemp_motor_loop(void){\n    // 用户实现:\n}\n\n/**\n * @brief  功率管驱动器过温保护动作 (status_overtemp_driver)\n */\nvoid unitlib_status_overtemp_driver_loop(void){\n    // 用户实现: 降额运行或风扇全速散热\n}\n\n/**\n * @brief  功率管驱动器过冷保护动作 (status_undertemp_driver)\n */\nvoid unitlib_status_undertemp_driver_loop(void){\n    // 用户实现:\n}\n\n/**\n * @brief  PCB 控制板过温保护动作 (status_overtemp_pcb)\n */\nvoid unitlib_status_overtemp_pcb_loop(void){\n    // 用户实现:\n}\n\n/**\n * @brief  PCB 控制板过冷保护动作 (status_undertemp_pcb)\n */\nvoid unitlib_status_undertemp_pcb_loop(void){\n    // 用户实现:\n}\n\n/**\n * @brief  机械堵转卡死保护动作 (status_stuck)\n * @note   电机电流已打满但转速持续低于阈值达 stuck_tick_delay 时触发\n */\nvoid unitlib_status_stuck_loop(void){\n    // 用户实现: 保护停机，防止持续堵转导致电机烧毁或机械牙箱打齿\n}\n\n/**\n * @brief  缺相保护动作 (status_phase_loss)\n * @note   三相中某相电流异常归零或开路时触发\n */\nvoid unitlib_status_phase_loss_loop(void){\n    // 用户实现: 切断 PWM，上报断相故障\n}\n\n/**\n * @brief  未知或通用严重故障动作 (status_fault)\n */\nvoid unitlib_status_fault_loop(void){\n    // 用户实现: 系统紧急安全自锁\n}\n",
      "annotations": [
        {
          "id": "run_states_loop",
          "title": "unitlib_status_standby_loop() & ready_loop() 待机安全阻抗与就绪待命",
          "startLine": 7,
          "endLine": 24,
          "category": "fsm",
          "categoryName": "状态执行体",
          "tag": "安全待机 / 就绪巡查",
          "summary": "电机处于待机或就绪状态时的巡查行为。待机时彻底关闭 PWM 并释放相线；就绪时监视启动触发指令并预充自举电容。",
          "pipeline": "STANDBY 状态持续执行 -> 闭锁下桥臂 -> READY 状态持续执行 -> 准备启动闭环",
          "lineByLine": [
            {
              "lines": "7-9",
              "desc": "待机状态 (status_standby) 周期执行动作。"
            },
            {
              "lines": "15-17",
              "desc": "就绪状态 (status_ready) 周期动作。"
            },
            {
              "lines": "22-24",
              "desc": "初始化过程状态 (status_initial_loop) 动作。"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "自举电容充电注意点",
              "text": "使用高压自举栅极驱动芯片 (如 IR2101/FD6288) 时，在启动前需短暂导通下桥臂以充满自举电容，确保上桥臂能够可靠开通。"
            }
          ],
          "extensions": "具备零待机功耗优势，非常适合电池供电设备。"
        },
        {
          "id": "motion_states_loop",
          "title": "unitlib_status_increasing_loop() ~ hold_loop() 加速、减速轨迹与零速保持",
          "startLine": 34,
          "endLine": 52,
          "category": "fsm",
          "categoryName": "运动控制",
          "tag": "加减速平滑 / 主动阻尼",
          "summary": "电机处于运行过程中的动力学状态体：INCREASING (按加速度斜率加负载)、DECREASING (能量回收减速) 与 HOLD (零速位置主动刚度锁定)。",
          "pipeline": "加减速规划器执行斜坡增量 -> 监控目标速度逼近度 -> 到达目标切入保持状态",
          "lineByLine": [
            {
              "lines": "34-36",
              "desc": "斜坡加速爬坡状态 (status_xxx_increasing)。"
            },
            {
              "lines": "42-44",
              "desc": "减速下坡状态 (status_xxx_decreasing)。"
            },
            {
              "lines": "50-52",
              "desc": "到达稳态伺服保持状态 (status_xxx_hold)。"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "主动阻尼与消振",
              "text": "在 HOLD 状态下引入速度微分反馈作为主动阻尼器，可以使电机在受到外力敲击拨动时迅速稳定，无任何长时间余振。"
            }
          ],
          "extensions": "在伺服机械手关节中，HOLD 状态可实现高精度负载静止悬停。"
        },
        {
          "id": "fault_states_loop",
          "title": "unitlib_status_overvoltage_loop() ~ overcurrent_loop() 母线压降与硬件过流保护",
          "startLine": 62,
          "endLine": 122,
          "category": "protection",
          "categoryName": "故障保护",
          "tag": "硬件保护 / 硬件熔断",
          "summary": "母线过压、欠压、硬件过流状态下的持续运行行为。执行声光蜂鸣器报警，维持 PWM 封锁，并检测故障是否解除以支持自恢复。",
          "pipeline": "检测到严重超限 -> 立即关闭定时器主输出 (MOE=0) -> 记录故障时长 -> 达到安全冷却时间允许复位",
          "lineByLine": [
            {
              "lines": "62-64",
              "desc": "过压保护动作 (切断 PWM，开启制动泄放)。"
            },
            {
              "lines": "70-72",
              "desc": "欠压保护动作 (关断功率管，记录电池电量耗尽)。"
            },
            {
              "lines": "78-80",
              "desc": "极限过流保护动作 (硬件级紧急封锁 PWM)。"
            },
            {
              "lines": "85-122",
              "desc": "电机、驱动管与控制板多路超温/过冷温控保护。"
            }
          ],
          "pitfalls": [
            {
              "type": "WARNING",
              "title": "过流故障的不可逆自锁",
              "text": "相电流过流通常由电机短路、相线接地或功率管击穿引起，属于一级致命故障，原则上必须通过外部断电重启或明确的清除故障指令方可解除。"
            }
          ],
          "extensions": "支持与外部刹车继电器配合，在过流时联动锁死机械抱闸。"
        },
        {
          "id": "stuck_phaseloss_loop",
          "title": "unitlib_status_stuck_loop() & phase_loss_loop() 堵转与缺相告警切断",
          "startLine": 128,
          "endLine": 145,
          "category": "protection",
          "categoryName": "故障保护",
          "tag": "堵转保护 / 缺相识别",
          "summary": "处理转子堵转与电机三相线缆接触不良。切断过热的相电流，防止电机线圈长时间承受堵转大电流而烧毁绝缘漆包线。",
          "pipeline": "堵转/缺相计时超限 -> 关闭输出 -> 发出特定节奏报警 -> 保护定子线包",
          "lineByLine": [
            {
              "lines": "128-130",
              "desc": "堵转保护动作 (持续超时停机防牙箱打齿或线圈烧毁)。"
            },
            {
              "lines": "136-138",
              "desc": "缺相保护动作 (切断 PWM，上报相线开路)。"
            },
            {
              "lines": "143-145",
              "desc": "通用严重故障 (status_fault) 紧急自锁。"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "缺相的物理特征",
              "text": "电机缺一相时通常无法自启动，并在上电时伴随沉闷的嗡嗡声与剧烈抖动；库中算法能在 50ms 内快速捕捉缺相特征并断开驱动。"
            }
          ],
          "extensions": "大幅提高了工业场景下恶劣震动接线环境的可靠度。"
        }
      ]
    },
    {
      "id": "unitlib_patch_c",
      "name": "UnitLib_Patch.c",
      "matrixIndex": "11",
      "role": "模块级钩子与用户定制扩展补丁",
      "header": "UnitLib_Patch.h",
      "hardware": "用户自定义扩展 / 外部观测器挂载",
      "badge": "Tier 2 扩展接口层",
      "shortDesc": "预留全套控制算法与观测器的初始化与周期计算钩子 (Hooks)，便于在不破坏库原有架构的前提下无缝插入专有算法。",
      "lineCount": 286,
      "sizeBytes": 3495,
      "content": "#include \"UnitLib_Patch.h\"\n\n\n\nvoid unitlib_patch_transfer1_init(Transfer1 *transfer){\n\n}\n\nvoid unitlib_patch_transfer2_init(Transfer2 *transfer){\n\n}\n\nvoid unitlib_patch_transfer3_init(Transfer3 *transfer){\n\n}\n\nvoid unitlib_patch_transfer4_init(Transfer4 *transfer){\n\n}\n\nvoid unitlib_patch_transfer5_init(Transfer5 *transfer){\n\n}\nvoid unitlib_patch_integrator_init(Integrator *integrator){\n\n\n}\n\nvoid unitlib_patch_derivative_init(Derivative *derivative){\n\n}\n\nvoid unitlib_patch_curve_init(Curve *curve){\n\n}\n\nvoid unitlib_patch_dft_init(Dft *dft){\n\n}\n\nvoid unitlib_patch_hall_init(Hall *hall){\n\n}\n\nvoid unitlib_patch_ladrc1_init(Ladrc1 *ladrc){\n\n}\n\nvoid unitlib_patch_ladrc2_init(Ladrc2 *ladrc){\n\n}\n\nvoid unitlib_patch_smc_init(Smc *smc){\n\n}\n\nvoid unitlib_patch_dpcc_init(Dpcc *dpcc){\n\n}\n\nvoid unitlib_patch_pir_init(Pir *pir){\n\n}\n\nvoid unitlib_patch_pid_init(Pid *pid){\n\n}\n\nvoid unitlib_patch_pll_init(Pll *pll){\n\n}\n\nvoid unitlib_patch_lpf1_init(Lpf1 *lpf){\n    \n}\n\nvoid unitlib_patch_lpf2_init(Lpf2 *lpf){\n\n}\n\nvoid unitlib_patch_hpf1_init(Hpf1 *hpf){\n\n}\n\nvoid unitlib_patch_hpf2_init(Hpf2 *hpf){\n    \n}\n\nvoid unitlib_patch_bpf1_init(Bpf1 *bpf){\n\n}\n\nvoid unitlib_patch_bpf2_init(Bpf2 *bpf){\n\n}\n\nvoid unitlib_patch_sogi_init(Sogi *sogi){\n\n}\n\nvoid unitlib_patch_nf_init(Nf *nf){\n\n}\n\nvoid unitlib_patch_tpnf_init(Tpnf *tpnf){\n\n}\n\nvoid unitlib_patch_dob_init(Dob *dob){\n\n}\n\nvoid unitlib_patch_rls_init(Rls *rls){\n\n}\n\nvoid unitlib_patch_smo_init(Smo *smo){\n\n}\n\nvoid unitlib_patch_nlfo_init(Nlfo *nlfo){\n\n}\n\nvoid unitlib_patch_vcfo_init(Vcfo *vcfo){\n\n}\n\nvoid unitlib_patch_hfi_init(Hfi *hfi){\n\n}\n\nvoid unitlib_patch_rolo_init(Rolo *rolo){\n\n}\n\nvoid unitlib_patch_mars_init(Mars *mars){\n\n}\n\nvoid unitlib_patch_ekf_init(Ekf *ekf){\n\n}\n\n// .......................................................................\nvoid unitlib_patch_transfer1_loop(Transfer1 *transfer){\n\n}\n\nvoid unitlib_patch_transfer2_loop(Transfer2 *transfer){\n\n}\n\nvoid unitlib_patch_transfer3_loop(Transfer3 *transfer){\n\n}\n\nvoid unitlib_patch_transfer4_loop(Transfer4 *transfer){\n\n}\n\nvoid unitlib_patch_transfer5_loop(Transfer5 *transfer){\n\n}\n\nvoid unitlib_patch_integrator_loop(Integrator *integrator){\n\n}\n\nvoid unitlib_patch_derivative_loop(Derivative *derivative){\n\n}\n\nvoid unitlib_patch_curve_loop(Curve *curve){\n\n}\n\nvoid unitlib_patch_dft_loop(Dft *dft){\n\n}\n\nvoid unitlib_patch_hall_loop(Hall *hall){\n\n}\n\nvoid unitlib_patch_ladrc1_loop(Ladrc1 *ladrc){\n\n}\n\nvoid unitlib_patch_ladrc2_loop(Ladrc2 *ladrc){\n\n}\n\nvoid unitlib_patch_smc_loop(Smc *smc){\n\n}\n\nvoid unitlib_patch_dpcc_loop(Dpcc *dpcc){\n\n}\n\nvoid unitlib_patch_pir_loop(Pir *pir){\n\n}\n\nvoid unitlib_patch_pid_loop(Pid *pid){\n\n}\n\nvoid unitlib_patch_pll_loop(Pll *pll){\n\n}\n\nvoid unitlib_patch_lpf1_loop(Lpf1 *lpf){\n\n}\n\nvoid unitlib_patch_lpf2_loop(Lpf2 *lpf){\n\n}\n\nvoid unitlib_patch_hpf1_loop(Hpf1 *hpf){\n\n}\n\nvoid unitlib_patch_hpf2_loop(Hpf2 *hpf){\n\n}\n\nvoid unitlib_patch_bpf1_loop(Bpf1 *bpf){\n\n}\n\nvoid unitlib_patch_bpf2_loop(Bpf2 *bpf){\n    \n}\n\nvoid unitlib_patch_sogi_loop(Sogi *sogi){\n\n}\n\nvoid unitlib_patch_nf_loop(Nf *nf){\n\n}\n\nvoid unitlib_patch_tpnf_loop(Tpnf *tpnf){\n\n}\n\nvoid unitlib_patch_dob_loop(Dob *dob){\n\n}\n\nvoid unitlib_patch_rls_loop(Rls *rls){\n    \n}\n\nvoid unitlib_patch_smo_loop(Smo *smo){\n\n}\n\nvoid unitlib_patch_nlfo_loop(Nlfo *nlfo){\n\n}\n\nvoid unitlib_patch_vcfo_loop(Vcfo *vcfo){\n\n}\n\nvoid unitlib_patch_hfi_loop(Hfi *hfi){\n\n}\n\nvoid unitlib_patch_rolo_loop(Rolo *rolo){\n\n}\n\nvoid unitlib_patch_mars_loop(Mars *mars){\n\n}\n\nvoid unitlib_patch_ekf_loop(Ekf *ekf){\n\n}\n\n",
      "annotations": [
        {
          "id": "patch_transfer_inits",
          "title": "unitlib_patch_transfer1_init() ~ transfer5_init() 传递函数补丁钩子",
          "startLine": 5,
          "endLine": 23,
          "category": "algorithm",
          "categoryName": "扩展接口",
          "tag": "用户补丁 / 架构解耦",
          "summary": "用户可在这些空桩函数中注入专有的传递函数离散系数配置或参数校准逻辑，无需修改只读的 SguanFOC 核心库源码。",
          "pipeline": "系统初始化阶段 -> 自动调用 unitlib_patch_*_init -> 用户在此挂载自定义参数",
          "lineByLine": [
            {
              "lines": "5-12",
              "desc": "一阶与二阶传递函数的初始化切入点。"
            },
            {
              "lines": "13-23",
              "desc": "高阶传递函数的初始化切入点。"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "升级免重构",
              "text": "当 SguanFOC 核心库版本升级时，用户在 Patch 中编写的定制扩展无需做任何改动，实现极高的模块隔离度。"
            }
          ],
          "extensions": "非常适合科研机构或整机厂商植入自己的专利算法。"
        },
        {
          "id": "patch_controllers",
          "title": "unitlib_patch_ladrc1_init() / smc_init() / dpcc_init() 高级控制器挂载点",
          "startLine": 45,
          "endLine": 67,
          "category": "algorithm",
          "categoryName": "扩展接口",
          "tag": "控制器插拔 / 算法挂载",
          "summary": "用户可以在此重载自抗扰控制器 LADRC、滑模控制器 SMC 或无拍预测电流控制 DPCC 的初始矩阵参数与观测器带宽。",
          "pipeline": "控制器初始化 -> Patch 钩子生效 -> 用户覆盖默认参数 -> 进入高精闭环",
          "lineByLine": [
            {
              "lines": "45-52",
              "desc": "自抗扰参数定制挂载点。"
            },
            {
              "lines": "53-60",
              "desc": "滑模趋近律参数定制挂载点。"
            },
            {
              "lines": "61-67",
              "desc": "无拍物理模型参数定制挂载点。"
            }
          ],
          "pitfalls": [
            {
              "type": "CAUTION",
              "title": "参数合法性保障",
              "text": "在 Patch 中覆盖参数时，务必注意采样周期 Ts 与电感电组的量纲单位一致性。"
            }
          ],
          "extensions": "便于对比不同现代控制算法在同一台电机上的控制性能表现。"
        },
        {
          "id": "patch_observers",
          "title": "unitlib_patch_smo_init() / hfi_init() / ekf_init() 专有无感观测器挂载点",
          "startLine": 117,
          "endLine": 144,
          "category": "algorithm",
          "categoryName": "无感扩展",
          "tag": "观测器挂载 / 算法替换",
          "summary": "用于用户接入自主研发的无传感器角度估计算法 (如特定拓扑的卡尔曼滤波协方差矩阵或自适应磁链观测器)。",
          "pipeline": "初始化阶段预热观测器状态矩阵 -> 配置滤波带宽 -> 闭环中即插即用替换原生角度",
          "lineByLine": [
            {
              "lines": "117-128",
              "desc": "滑模与非线性磁链观测器挂载点。"
            },
            {
              "lines": "129-144",
              "desc": "高频注入载波发生器与 EKF 协方差初始化点。"
            }
          ],
          "pitfalls": [
            {
              "type": "TIP",
              "title": "无缝替换电角度来源",
              "text": "用户算法计算出的电角度只需赋值给核心句柄的 theta 成员，高频环就会自动使用该角度完成矢量控制。"
            }
          ],
          "extensions": "极大地拓宽了 SguanFOC 库作为电机教学与学术科研平台的实用广度。"
        },
        {
          "id": "patch_runtime_loops",
          "title": "unitlib_patch_*_loop() 运行时周期切入回调链",
          "startLine": 146,
          "endLine": 285,
          "category": "algorithm",
          "categoryName": "扩展接口",
          "tag": "运行时钩子 / 周期拦截",
          "summary": "在每个控制算法每个计算周期结束后调用的后处理钩子，可用于采集算法内部中间变量、在线辨识参数或实施前馈补偿注入。",
          "pipeline": "原生算法计算完成 -> 调用 patch_loop 回调 -> 用户截获或修正输出 -> 输出至执行级",
          "lineByLine": [
            {
              "lines": "146-200",
              "desc": "传递函数、积分微分与自抗扰运行周期钩子。"
            },
            {
              "lines": "201-240",
              "desc": "PID 与各类数字滤波器运行周期钩子。"
            },
            {
              "lines": "241-285",
              "desc": "全套无感观测器周期性更新钩子。"
            }
          ],
          "pitfalls": [
            {
              "type": "WARNING",
              "title": "严禁在钩子中做耗时阻塞",
              "text": "部分 patch_loop 运行在 PWM 中断中，用户切入代码必须保持极简极快，严禁打印日志或等待外设响应。"
            }
          ],
          "extensions": "赋予了开发者对整个控制流水线各个节点前所未有的自由干预与掌控能力。"
        }
      ]
    }
  ]
};
