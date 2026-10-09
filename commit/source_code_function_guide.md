---
title: "SguanFOC v4.0.0 核心源码函数级逐行深度解析教学指南"
---

# SguanFOC v4.0.0 核心源码函数级逐行深度解析教学指南 (Mastering the Codebase)

> **文档定位**：本指南专为立志**彻底吃透 SguanFOC 库 v4.0.0** 的嵌入式驱动工程师、控制算法工程师与电机控制初学者编写。  
> 本文拒绝浮于表面的概括，**全面覆盖工程中每一个源文件与头文件，对库中的每一个函数进行逐一、详尽的解剖**。  
> 每一个核心函数均包含：**源码位置与原型**、**入参与出参物理意义**、**数学公式与底层逻辑推导**、**逐行逻辑执行分析**、**在全系统调用链路中的上下游关系**、以及**实战调参延伸与硬件避坑指南**。

---

## 目录与核心源文件矩阵

| 序号 | 源代码文件 | 核心职责 | 在系统架构中的角色 |
| :---: | :--- | :--- | :--- |
| 1 | [`SguanFOC.c`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/SguanFOC.c) / [`SguanFOC.h`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/SguanFOC.h) | 多电机 X-Macro 元编程、根对象实例化与总中断任务分发 | **顶级系统控制中枢** |
| 2 | [`Sguan_Config.h`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_Config.h) / [`UnitLib_Config.h`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/UnitLib_Config.h) | 系统编译期宏配置、模块开关裁剪、数制精度选择与电机轴数 | **全局配置层** |
| 3 | [`Sguan_Value.h`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_Value.h) | 统一抽象数制类型 (`SguanQ`, `SguanF`)、浮点与定点兼容层 | **基础数据类型定义** |
| 4 | [`Sguan_math.c`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_math.c) / [`Sguan_math.h`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_math.h) | 512点高速正弦查表、正余弦同步解算、91点线性插值反正切求解 | **极速数学运算库** |
| 5 | [`Sguan_IQmath.c`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_IQmath.c) / [`Sguan_IQmath.h`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_IQmath.h) | Q31 与 Q15 跨基准缩放、饱和加减乘除、定点浮点互转 | **定点数学计算核心** |
| 6 | [`Sguan_Transfer.c`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_Transfer.c) / [`Sguan_Transfer.h`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_Transfer.h) | 38 大模块双线性离散化引擎、传递函数、滤波器、观测器与控制器 | **核心算法与传递函数引擎** |
| 7 | [`UnitLib_Patch.c`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/UnitLib_Patch.c) / [`UnitLib_Patch.h`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/UnitLib_Patch.h) | 76 个全模块初始化与执行期动态扩展补丁插桩挂钩 | **动态插件扩展机制** |
| 8 | [`Sguan_MotorStatus.c`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_MotorStatus.c) / [`Sguan_MotorStatus.h`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_MotorStatus.h) | 196项矩阵有限状态机、即时/延时过流、过压、欠压、堵转多级保护 | **有限状态机与故障安防网** |
| 9 | [`UnitLib_Status.c`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/UnitLib_Status.c) / [`UnitLib_Status.h`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/UnitLib_Status.h) | 状态机各状态执行期动作钩子函数 | **状态动作执行层** |
| 10 | [`Sguan_printf.c`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_printf.c) / [`Sguan_printf.h`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_printf.h) | DJB2 字符串哈希快速匹配、轻量浮点解析、JustFloat 上位机示波器 | **通信协议与调参引擎** |
| 11 | [`UnitLib_UserControl.c`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/UnitLib_UserControl.c) / [`UnitLib_UserControl.h`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/UnitLib_UserControl.h) | 上位机指令字典与目标转速/角度/电流回调派发 | **用户指令分发层** |
| 12 | [`UserData_Driver.c`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/UserData_Driver.c) / [`UserData_Driver.h`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/UserData_Driver.h) | 定时器 PWM 占空比输出、ADC 注入采样、编码器/霍尔、母线电压采集 | **硬件抽象驱动层 (HAL)** |
| 13 | [`UnitLib_main.c`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/UnitLib_main.c) / [`UnitLib_main.h`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/UnitLib_main.h) | 高频/低频/主循环调度、电机遥测数据打包与状态机喂养 | **业务主循环与调度层** |
| 14 | [`Sguan_Method.c`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_Method.c) / [`Sguan_Method.h`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_Method.h) | 通用多数据类型参数通道与响应状态容器 | **通用参数容器层** |
| 15 | `Zone_Master.*` / `Zone_Parameter.*` / `UserData_Config.h` | 区域主控、控制周期时间定义与参数保存配置 | **配置与区域划分** |

---

## 一、系统顶级中枢与多电机元编程 (`SguanFOC.c` / `SguanFOC.h`)

[`SguanFOC.h`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/SguanFOC.h) 声明了系统核心数据结构，[`SguanFOC.c`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/SguanFOC.c) 负责管理全局多电机对象数组 `sguanfoc[CONFIG_MOTOR]`。

### 1. 核心数据结构精析

* `Foc`: 存储 FOC 中间量，包括期望转速/位置/电流 (`target_speed`, `target_pos`, `target_id`, `target_iq`)、电压指令 (`target_ud`, `target_uq`)、坐标变换中间电压 (`ualpha`, `ubeta`)、三相占空比输出 (`du`, `dv`, `dw`)、以及正余弦瞬时值 (`sine`, `cosine`)。
* `Encoder`: 存储转子机械角度 `real_position`、机械转速 `real_speed`、电气角速度 `real_We`、电气角度 `real_Re`、以及零位偏置角 `real_offset`。
* `Current`: 存储相电流实际值 (`real_ia`, `real_ib`, `real_ic`)、静止坐标系电流 (`real_ialpha`, `real_ibeta`)、旋转坐标系电流 (`real_id`, `real_iq`)、ADC 增益 `final_gain` 以及运放零偏偏置 `current_offset0`, `current_offset1`。
* `Master`: 电机本体物理参数，包括相电阻 `rs`、直轴电感 `ld`、交轴电感 `lq`、永磁体磁链 `flux`、极对数 `poles`、母线电压 `vbus`、以及硬件方向标志位 (`motor_dir`, `encoder_dir`, `pwm_dir`)。
* `SguanFoc`: 顶级电机句柄结构体，聚合上述所有模块，并包含任务函数指针。

### 2. 函数级解析

#### (1) `MAKE_MOTOR_FUNCS(n)` 宏生成函数群

* **源码位置**：[`SguanFOC.c#L32-L51`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/SguanFOC.c)
* **函数原型**：由宏批量生成 `static void high_loop_##n(void)`, `low_loop_##n(void)`, `main_loop_##n(void)`（$n \in [0, 5]$）
* **入参与出参**：`void -> void`
* **底层逻辑**：
  ```c
  static void high_loop_##n(void) {
      SguanFoc *p = &sguanfoc[n];
      sguanfoc_high_loop(p);
  }
  ```
  通过 X-Macro，使每个电机实例拥有固定的入口函数，方便直接挂载到不同硬件定时器中断向量（如 TIM1 挂电机0，TIM8 挂电机1）。

* **上下游关系**：直接被硬件定时器中断服务函数 (ISR) 或 RTOS 任务周期性调用。

#### (2) `sguanfoc_high_loop(SguanFoc *sguan)`

* **源码位置**：[`SguanFOC.c#L78-L108`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/SguanFOC.c)
* **函数原型**：`static void sguanfoc_high_loop(SguanFoc *sguan)`
* **参数说明**：`sguan`：当前执行的电机控制实例指针。
* **业务逻辑**：根据编译期宏 `CONFIG_MOTOR`，若为单电机，直接调用 [`unitlib_main_high_loop(sguan)`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/UnitLib_main.c)；若为多电机，依据 `sguan->id_flag` 分发至 `unitlib_main_high_loop_one(sguan)` 到 `six(sguan)`。
* **执行时效**：高频中断（通常 $10\text{kHz} \sim 40\text{kHz}$），要求极速执行，严禁任何延时或死循环。

#### (3) `sguanfoc_low_loop(SguanFoc *sguan)`

* **源码位置**：[`SguanFOC.c#L116-L118`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/SguanFOC.c)
* **函数原型**：`static void sguanfoc_low_loop(SguanFoc *sguan)`
* **业务逻辑**：转发至 [`unitlib_main_low_loop(sguan)`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/UnitLib_main.c)，执行状态机轮询、温度采集与低频故障保护。通常以 $100\text{Hz} \sim 1\text{kHz}$ 周期执行。

#### (4) `sguanfoc_printf_loop(uint8_t *data, uint16_t length)`

* **源码位置**：[`SguanFOC.c#L127-L136`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/SguanFOC.c)
* **函数原型**：`static void sguanfoc_printf_loop(uint8_t *data, uint16_t length)`
* **参数说明**：`data`：串口接收 DMA 缓冲区指针；`length`：本次接收字节数。
* **业务逻辑**：内部维护静态标志 `count`，开机首次调用时触发 [`printf_rx_init()`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_printf.c) 初始化 DJB2 哈希表，随后调用 [`printf_rx_loop(data, length)`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_printf.c) 完成指令解析与参数注入。

#### (5) `sguanfoc_main_loop(SguanFoc *sguan)`

* **源码位置**：[`SguanFOC.c#L143-L171`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/SguanFOC.c)
* **业务逻辑**：背景主循环派发器，分发给 `unitlib_main_main_loop(sguan)` 执行非实时后台任务。

---

## 二、极速数学运算与统一数制 (`Sguan_math` & `Sguan_IQmath` & `Sguan_Value`)

### 1. `Sguan_math.c` 核心函数解析

#### (1) `math_sin(float theta)`

* **源码位置**：[`Sguan_math.c#L103-L124`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_math.c)
* **函数原型**：`float math_sin(float theta)`
* **算法逻辑**：

  1. 周期归一化：通过 `while` 循环将 $\theta$ 限制在 $[0, 2\pi]$ 区间内：
     ```c
     if (theta > VALUE_2PI) theta -= VALUE_2PI;
     else if (theta < 0)    theta += VALUE_2PI;
     ```
  2. 映射表索引换算：512 点等分 $2\pi$，换算系数 `MATH_512_2PI = 512.0f / (2 * PI) = 81.48733f`：
     ```c
     float idx_f = theta * MATH_512_2PI;
     int idx = (int)idx_f;
     if (idx >= 512) idx = 511;
     return sin_tab[idx];
     ```
* **避坑要点**：查表法精度约为 $2\pi / 512 \approx 0.012\text{ rad} \approx 0.7^\circ$，足以满足绝大多数矢量控制需求；如需超高精度伺服，可结合前后两点进行一次线性插值。

#### (2) `math_sin_cos(float x, float *sin_x, float *cos_x)`

* **源码位置**：[`Sguan_math.c#L134-L137`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_math.c)
* **函数原型**：`void math_sin_cos(float x, float *sin_x, float *cos_x)`
* **算法原理**：余弦利用三角恒等式 $\cos(x) = \sin(\frac{\pi}{2} - x)$，一次调用同时解算出正弦和余弦，专为 Park 变换及逆变换服务。

#### (3) `math_tan(float x)`

* **源码位置**：[`Sguan_math.c#L145-L149`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_math.c)
* **实现**：`return sine / cosine;`。注意需防范分母接近 0 的浮点除零异常。

#### (4) `math_atan(float x)`

* **源码位置**：[`Sguan_math.c#L188-L214`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_math.c)
* **函数原型**：`float math_atan(float x)`
* **算法精妙推导**：

  1. NaN 异常拦截：`if (x != x) return x;`
  2. 奇函数性质利用：若 $x < 0$，返回 `-math_atan(-x)`。
  3. 倒数性质扩展定义域：若 $x > 1.0$，利用数学恒等式 $\arctan(x) = \frac{\pi}{2} - \arctan(1/x)$，将任意大正实数压缩到 $[0, 1.0]$ 区间内！
  4. 91 点表线性插值：$[0, 1.0]$ 映射为 90 个细分区间：
     ```c
     float pos = x * 90.0f;
     int i = (int)pos;
     float t = pos - (float)i;
     return atan_tab[i] + (atan_tab[i+1] - atan_tab[i]) * t;
     ```
* **性能评估**：在没有硬件 FPU 三角函数加速器的 Cortex-M0/M3 上，该函数速度比标准库 `atan()` 快一个数量级！

---

### 2. `Sguan_IQmath.c` 核心函数解析

在没有硬件浮点运算单元 (FPU) 的单片机中，浮点运算极其缓慢，定点化 (Q15/Q31) 必不可少。SguanFOC 提供了基准标幺化的定点运算核心：

#### (1) `iqmath_from_float(SguanF f, SguanF base_value)`

* **源码位置**：[`Sguan_IQmath.c#L27-L64`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_IQmath.c)
* **参数说明**：`f`：真实工程物理量（如 $12.5\text{A}$）；`base_value`：该物理量的基准基值（如电机额定最大电流 $20\text{A}$）。
* **数学计算**：归一化为标幺值 $f_{pu} = f / base\_value \in [-1.0, +1.0)$，再乘以 $2^{31} = 2147483648$，并带有 `+0.5` / `-0.5` 四舍五入与溢出饱和钳位 (`Q31_MAX` / `Q31_MIN`)。

#### (2) `iqmath_to_float(SguanQ q, SguanF base_value)`

* **数学计算**：逆向还原：$f = (q / 2^{31}) \cdot base\_value$。

#### (3) `iqmath_add` / `iqmath_sub` / `iqmath_mul` / `iqmath_div`

* **饱和保护机制**：

  * 加法：若 `a > 0` 且 `b > 0` 但和溢出变负，强制饱和钳位在 `Q31_MAX`；双负同理钳位在 `Q31_MIN`。
  * 乘法：使用 64 位宽临时变量存储 32 位相乘结果，加 $2^{30}$ 四舍五入后右移 31 位 (`(result + (1LL << 30)) >> 31`)。
  * 除法：分子先左移 31 位成为 64 位数再除以分母，内置余数舍入与除以零防崩溃保护。

#### (4) `iqmath_convert_base(SguanQ q, SguanF old_base, SguanF new_base)`

* **业务价值**：当算法各环节基准量不一致时（例如电流环基准为 $30\text{A}$，速度环基准为 $6000\text{rpm}$），进行不同基准间的无缝比例换算：$q_{new} = q \cdot (old\_base / new\_base)$。

---

## 三、38 大核心算法与传递函数引擎 (`Sguan_Transfer.c` / `Sguan_Transfer.h`)

[`Sguan_Transfer.h`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_Transfer.h) 采用了半隐藏设计模式：

* `In`, `Out`, `Params` 结构体完全公开，用户可直接赋值输入与读取输出；
* `Data` 运行状态结构体作为**不透明指针 (Opaque Pointer)** 隐藏在 `Sguan_Transfer.c` 中，外部无法直接篡改历史缓存；
* 内存通过静态池管理，提供 `transfer_xxx_get(motor, ch)` 获取单例，杜绝动态内存 `malloc` 碎片化。

### 1. 通用离散传递函数族 (`Transfer1` $\sim$ `Transfer5`)

#### `transfer_transfer1_init(Transfer1 *transfer)` 与 `transfer_transfer1_loop(Transfer1 *transfer)`

* **源码位置**：[`Sguan_Transfer.c#L15-L55`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_Transfer.c)
* **数学公式**：前文已严密推导的双线性变换：
  $$b_0 = 2 \cdot num_1 + num_0 T_s, \quad b_1 = -2 \cdot num_1 + num_0 T_s$$
  $$a_0 = 2 \cdot den_1 + den_0 T_s, \quad a_1 = -2 \cdot den_1 + den_0 T_s$$
  $$y[k] = \frac{b_0 u[k] + b_1 u[k-1] - a_1 y[k-1]}{a_0}$$

* **动态重算标志**：`transfer->params.recalculate_total_flag`：当控制周期中采样时间 $T_s$ 或截止频率改变时，置位此标志，`loop` 内部自动更新分母分子系数，实现参数在线热自适应。
* `Transfer2` 至 `Transfer5`：分别对应二阶至五阶连续系统的差分求解，内部使用 `i[N]` 与 `o[N]` 数组维护历史步长。

---

### 2. 经典微积分算子 (`Integrator` & `Derivative`)

#### `transfer_integrator_loop(Integrator *integrator)`

* **源码位置**：[`Sguan_Transfer.c#L356-L381`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_Transfer.c)
* **实现逻辑**：前向梯形积分：
  $$y[k] = y[k-1] + \frac{T_s}{2}(u[k] + u[k-1])$$
  并内置上下限饱和限幅与历史重置接口 `transfer_reset_integrator(p)`。

#### `transfer_derivative_loop(Derivative *derivative)`

* **源码位置**：[`Sguan_Transfer.c#L392-L432`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_Transfer.c)
* **抗噪核心**：纯微分对高频高斯白噪声有极大的放大倍数，导致输出剧烈跳动。该模块实现为**不完全滤波微分**：
  $$G(s) = \frac{s}{\tau s + 1}$$
  高频增益被限制在 $1/\tau$，在提取微分趋势的同时抑制高频毛刺。

---

### 3. 高级数字滤波器族

#### (1) `transfer_lpf1_loop(Lpf1 *lpf)` 与 `transfer_lpf2_loop(Lpf2 *lpf)`

* **源码位置**：[`Sguan_Transfer.c#L784-L887`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_Transfer.c)
* **算法实现**：

  * `Lpf1`：$G(s) = \frac{\omega_c}{s + \omega_c}$，经 Tustin 离散化后：

    $$a_0 = 2 + T_s \omega_c, \quad a_1 = -2 + T_s \omega_c, \quad b_0 = b_1 = T_s \omega_c$$

  * `Lpf2`：标准二阶巴特沃斯低通，阻尼比 $\zeta = \frac{\sqrt{2}}{2}$，特征分母 $s^2 + \sqrt{2}\omega_c s + \omega_c^2$。

#### (2) `transfer_nf_loop(Nf *nf)` (陷波滤波器)

* **源码位置**：[`Sguan_Transfer.c#L1199-L1247`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_Transfer.c)
* **数学传函**：
  $$G(s) = \frac{s^2 + \omega_0^2}{s^2 + 2\zeta \omega_0 s + \omega_0^2}$$

* **实战价值**：当机械臂或云台在某一频率（如 $200\text{Hz}$）发生强烈共振啸叫时，只需将 `nf->params.wo = 2 * PI * 200`，该滤波器在该频点增益骤降为零，彻底切断共振环路。

#### (3) `transfer_sogi_loop(Sogi *sogi)` (二阶广义积分器)

* **源码位置**：[`Sguan_Transfer.c#L1157-L1181`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_Transfer.c)
* **特性**：能够同时输出与输入信号同相位的带通信号 $v(t)$ 和严格正交滞后 $90^\circ$ 的积分信号 $qv(t)$，广泛用于单相无感观测器与不平衡电网锁相。

---

### 4. 现代控制与无感观测器库接口规范

在 v4.0.0 中，`Pid`, `Ladrc1`, `Ladrc2`, `Smc`, `Dpcc`, `Pir`, `Pll`, `Smo`, `Nlfo`, `Vcfo`, `Hfi`, `Rolo`, `Mars`, `Ekf` 采用了**高扩展架构设计**：

* 每一个控制器与观测器均配备结构体与私有数据缓存，并在 `transfer_xxx_init` 与 `transfer_xxx_loop` 中预留了向 [`UnitLib_Patch`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/UnitLib_Patch.c) 的直通调用；
* 允许开发者根据项目需求，在 Patch 层自由挂接 v3.1.0 的成熟实战实现、MATLAB/Simulink 自动生成的代码、或自定义高级观测器。

---

## 四、有限状态机与故障安防体系 (`Sguan_MotorStatus.c` / `Sguan_MotorStatus.h`)

[`Sguan_MotorStatus.c`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_MotorStatus.c) 是确保电机与功率管不烧毁的“生命守护神”。

### 1. 状态机构成全景

* **29 种状态 (`HandleStatus`)**：

  * 待机停机：`status_standby`
  * 初始化阶段：`status_ready`, `status_initializing`, `status_gotoinit0_angle`, `status_gotoinit1_current`
  * 正常工作模态：`status_idle`, 包含转矩/速度/位置三种控制模式下的三种微状态：增加中 (`increasing`)、减少中 (`decreasing`)、保持中 (`hold`)
  * 13 种保护故障态：过压 (`overvoltage`)、欠压 (`undervoltage`)、过流 (`overcurrent`)、电机过温/过冷、驱动器件过温/过冷、PCB 过温/过冷、卡死堵转 (`stuck`)、缺相 (`phase_loss`)、短路 (`circuit_short`)、未知故障 (`fault`)。

### 2. 核心函数解析：`motorstatus_loop(void *sguan)`

* **源码位置**：[`Sguan_MotorStatus.c#L470-L866`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_MotorStatus.c)
* **函数原型**：`void motorstatus_loop(void *sguan)`
* **执行全流程**：

  1. **遍历状态转移表 `motor_tab[196]`**：匹配当前状态 `p->motorstatus.status == motor_tab[i].status_now`；
  2. **事件触发判定**：
     * **过压/欠压**：直接对比 `vbus_real` 与 `vbus_max`/`vbus_min`；
     * **过流判定 (双重条件)**：
       ```c
       // 条件 1: 瞬时大电流峰值打满
       if (ibus_real >= ibus_instant_max) -> 触发 event_overcurrent;
       // 条件 2: 持续超额定电流反时限积分
       if (ibus_real > ibus_stable_max) {
           tick = tick_run - ibus_tick_run;
           if (tick >= ibus_tick_delay) -> 触发 event_overcurrent;
       }
       ```
     * **堵转检测 (`event_stuck`)**：当速度低于阈值且电流维持高位持续时间超过 `stuck_tick_delay`，判定为卡死；
     * **温度检测**：对比电机、驱动桥及 PCB 实时测温值与预设阈值。
  3. **状态迁移与切机**：
     * 一旦判定状态改变，更新时间戳 `tick_last`；
     * 执行目标状态的专有进入初始化函数 `motorstatus_initial_init[new_status](p)`（如复位 PWM、清零积分器、记录错误码 `error_code`）；
     * 周期性执行目标状态的动作函数 `motorstatus_action_loop[new_status]()`。

---

## 五、通信、指令解析与硬件抽象 (`Sguan_printf` & `UserData_Driver`)

### 1. 串口极速调参协议与示波器 (`Sguan_printf.c` / `Sguan_printf.h`)

#### (1) `hash_compute(const char *str, uint8_t len)`

* **源码位置**：[`Sguan_printf.c#L27-L33`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_printf.c)
* **算法**：经典 DJB2 字符串哈希，初始哈希种子 5381，逐字符左移 5 位并累加 (`hash * 33 + c`)。

#### (2) `get_data_fast(uint8_t start_idx)`

* **源码位置**：[`Sguan_printf.c#L47-L82`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_printf.c)
* **算法**：支持负号、浮点小数点的无依赖单遍扫描字符串转浮点函数。一旦遭遇非数字字符立刻终止，具备强抗干扰与防死机能力。

#### (3) `printf_rx_loop(uint8_t *data, uint16_t length)`

* **源码位置**：[`Sguan_printf.c#L173-L200`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_printf.c)
* **帧格式说明**：

  * 指令以键值对传输，例如：`Speed=1500.5?`
  * 自动过滤 `\r`, `\n`, 空格等噪声字符；
  * 遇到终止符 `?` 触发 `printf_adjust()` 执行哈希查表与派发；
  * 缓冲区超过 40 字节仍未收到 `?` 则启动熔断清空，防止内存越界。

#### (4) `printf_tx_init(Printf *str)`

* **源码位置**：[`Sguan_printf.c#L136-L141`](../SguanFOC库v4.0.0(高度自由模块化foc，终阶)/Sguan_printf.c)
* **帧尾定义**：JustFloat 虚拟示波器协议标准帧尾：`0x00, 0x00, 0x80, 0x7F`（即单精度浮点数 NaN 标识符）。后接 10 通道浮点数据，上位机以极高帧率接收并实时绘图。

---

### 2. 硬件驱动抽象层 (`UserData_Driver.c` / `UserData_Driver.h`)

该文件完全由用户或特定单片机平台（如 STM32, CH32V307, TI C2000）实现，解耦硬件：

* `userdata_driver_set_pwm(...)`: 写入六路定时器通道的比较寄存器；
* `userdata_driver_read_iabc(...)`: 读取 ADC 注入转换结果并减去校准偏置；
* `userdata_driver_read_encoder(...)`: 读取磁编码器当前原始计数值（如 MT6835, AS5600, MA730）；
* `userdata_driver_read_vbus(...)` / `read_ibus(...)`: 母线电压与电流转换；
* `userdata_driver_read_temp_xxx(...)`: NTC 热敏电阻采样与温度计算。
