# -*- coding: utf-8 -*-
"""
SguanFOC v4.0.0 - Interactive Code Walkthrough Data Builder
Bundles 11 core files with deep function-level line annotations,
mathematical formulas (LaTeX), hardware pipelines, and engineering pitfalls.
Generates walkthrough_data.js for offline interactive dual-screen learning.
"""

import os
import json
import codecs

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "SguanFOC库v4.0.0(高度自由模块化foc，终阶)"))
OUTPUT_JS_COMMIT = os.path.join(BASE_DIR, "walkthrough_data.js")
OUTPUT_JS_HTML = os.path.join(BASE_DIR, "html_docs", "walkthrough_data.js")

FILES_CONFIG = [
    {
        "id": "sguanfoc_c",
        "name": "SguanFOC.c",
        "matrixIndex": "01",
        "role": "FOC 顶层调度与多轴元编程",
        "header": "SguanFOC.h",
        "hardware": "Cortex-M 中断 / PWM 定时器触发",
        "badge": "Tier 0 顶层中枢",
        "shortDesc": "多电机 X-Macro 宏展开分发器、高频 PWM 中断控制周期 (sguanfoc_high_loop)、低频遥测与有限状态机调度中枢。",
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

def build_data():
    print("=" * 60)
    print("  Building SguanFOC v4.0.0 Interactive Walkthrough Dataset")
    print("=" * 60)
    
    output_files = []
    
    for cfg in FILES_CONFIG:
        fname = cfg["name"]
        fpath = os.path.join(SRC_DIR, fname)
        if not os.path.exists(fpath):
            print(f"[ERROR] Source file not found: {fpath}")
            continue
            
        with codecs.open(fpath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
            
        lines = content.split("\n")
        line_count = len(lines)
        size_bytes = os.path.getsize(fpath)
        
        file_obj = {
            "id": cfg["id"],
            "name": cfg["name"],
            "matrixIndex": cfg["matrixIndex"],
            "role": cfg["role"],
            "header": cfg["header"],
            "hardware": cfg["hardware"],
            "badge": cfg["badge"],
            "shortDesc": cfg["shortDesc"],
            "lineCount": line_count,
            "sizeBytes": size_bytes,
            "content": content,
            "annotations": cfg["annotations"]
        }
        output_files.append(file_obj)
        print(f"[OK] Bundled {cfg['name']:24} | {line_count:4} lines | {len(cfg['annotations']):2} cards")
        
    js_data = "window.WALKTHROUGH_DATA = " + json.dumps({"files": output_files}, ensure_ascii=False, indent=2) + ";\n"
    
    # Write to commit/walkthrough_data.js
    with codecs.open(OUTPUT_JS_COMMIT, "w", encoding="utf-8") as f:
        f.write(js_data)
    print(f"[SUCCESS] Written: {OUTPUT_JS_COMMIT} ({len(js_data)} bytes)")
    
    # Write to commit/html_docs/walkthrough_data.js
    os.makedirs(os.path.dirname(OUTPUT_JS_HTML), exist_ok=True)
    with codecs.open(OUTPUT_JS_HTML, "w", encoding="utf-8") as f:
        f.write(js_data)
    print(f"[SUCCESS] Written: {OUTPUT_JS_HTML} ({len(js_data)} bytes)")
    print("=" * 60)

if __name__ == "__main__":
    build_data()
