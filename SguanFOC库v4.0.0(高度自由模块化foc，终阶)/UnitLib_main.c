#include "UnitLib_main.h"

/* SguanFOC配置文件声明 */
#include "UserData_Driver.h"
#include "Zone_Master.h"
#include "Zone_Parameter.h"

/**
 * @brief  待机停机状态初始化
 * @param  sguanfoc: 当前电机句柄指针
 * @note   在进入待机状态 (status_standby) 时执行一次，通常用于关断 PWM 输出，使能下桥制动或自由滑行
 */
void unitlib_main_standby_init(SguanFoc *sguanfoc){
    // 用户可在此调用底层驱动关断 PWM 或释放使能引脚:
    // userdata_driver_set_pwm(sguanfoc->id_flag, 0, 0, 0, 0, 0, 0);
}

/**
 * @brief  系统就绪状态初始化
 * @param  sguan: 当前电机句柄指针
 * @note   在电机从待机切换到就绪 (status_ready) 时执行一次
 */
void unitlib_main_ready_init(SguanFoc *sguan){
    // 用户可在此进行预充磁或清除先前的临时运行缓存
}

/**
 * @brief  开机自检与参数初始化专项
 * @param  sguan: 当前电机句柄指针
 * @note   完成自检后将 run_flag 置为 RUN_SUCCESS，驱动状态机自动流转到下一个初始化节点
 */
void unitlib_main_initializing_init(SguanFoc *sguan){
    // 用户可在此进行硬件自检 (母线电压检测、温度检测等)
    
    // 赋值 run_flag 为成功，推动状态机进入角度校准专项
    sguan->run_flag = RUN_SUCCESS;
}

/**
 * @brief  编码器电角度零位 Offset 标定专项初始化
 * @param  sguan: 当前电机句柄指针
 * @note   通常采用直流电压矢量定向法: 给定固定 Ualpha 电压将转子吸合至 A 相轴线，
 *         稳定后采集编码器计数值作为 offset，最后置位 RUN_SUCCESS 驱动状态机进入电流校准。
 */
void unitlib_main_goinit0_angle_init(SguanFoc *sguan){
    // 标定逻辑示例:
    // sguan->foc.ualpha = 2.0f; sguan->foc.ubeta = 0.0f;
    // delay_ms(500);
    // sguan->encoder.real_offset = userdata_driver_read_encoder(sguan->id_flag);
    
    // 标定完成，切换到下一个状态
    sguan->run_flag = RUN_SUCCESS;
}

/**
 * @brief  ADC 电流采样零点偏置校准专项初始化
 * @param  sguan: 当前电机句柄指针
 * @note   在逆变器停机或输出 50% 零矢量时，采样运放输出的参考偏置 (通常为 1.65V / 2048 码值)，
 *         累加多次求平均值并存储于 current_offset0/1 中，最后置位 RUN_SUCCESS。
 */
void unitlib_main_goinit1_current_init(SguanFoc *sguan){
    // 偏置校准完成后赋值 run_flag，推动状态机正式进入空闲就绪 (status_idle) 运行状态
    sguan->run_flag = RUN_SUCCESS;
}

/* =============================================================================== */
/*                           多轴高频控制环专属处理函数 (1 ~ 6 轴)                  */
/* =============================================================================== */

void unitlib_main_high_loop_one(SguanFoc *sguan){
    // 电机 1 高频核心控制逻辑:
    // 1. 读取电流与编码器 -> 2. Clarke/Park 变换 -> 3. 电流环调节 -> 4. 逆Park -> 5. SVPWM 输出
}

void unitlib_main_high_loop_two(SguanFoc *sguan){
    // 电机 2 高频控制逻辑
}

void unitlib_main_high_loop_three(SguanFoc *sguan){
    // 电机 3 高频控制逻辑
}

void unitlib_main_high_loop_four(SguanFoc *sguan){
    // 电机 4 高频控制逻辑
}

void unitlib_main_high_loop_five(SguanFoc *sguan){
    // 电机 5 高频控制逻辑
}

void unitlib_main_high_loop_six(SguanFoc *sguan){
    // 电机 6 高频控制逻辑
}

/* =============================================================================== */
/*                             单轴高频通用控制环入口                               */
/* =============================================================================== */
void unitlib_main_high_loop(SguanFoc *sguan){
    // 单轴控制模式下的统一高频控制环执行体
}

/* =============================================================================== */
/*                         低频周期任务与状态机遥测数据喂养                         */
/* =============================================================================== */
/**
 * @brief  低频周期任务 (通常以 100Hz ~ 1kHz 频率执行)
 * @param  sguan: 当前电机句柄指针
 * @note   职责:
 *         1. 收集全系统物理遥测数据 (力矩/转速/位置、母线电压、母线电流、三处温度、时钟节拍);
 *         2. 将数据统一填入 motorstatus.data 结构体;
 *         3. 设定当前控制模式;
 *         4. 触发 196 项有限状态机 motorstatus_loop() 执行故障诊断与动作迁移。
 */
void unitlib_main_low_loop(SguanFoc *sguan){
    // 1. 打包并初始化状态机输入数据 (用于过压、过流、超温、堵转判别)
    sguan->motorstatus.data.tor_real        = sguan->current.real_iq;
    sguan->motorstatus.data.tor_target      = sguan->foc.target_iq;
    sguan->motorstatus.data.vel_real        = sguan->encoder.real_speed;
    sguan->motorstatus.data.vel_target      = sguan->foc.target_speed;
    sguan->motorstatus.data.pos_real        = sguan->encoder.real_position;
    sguan->motorstatus.data.pos_target      = sguan->foc.target_pos;
    sguan->motorstatus.data.vbus_real       = userdata_driver_read_vbus(sguan->id_flag);
    sguan->motorstatus.data.ibus_real       = userdata_driver_read_ibus(sguan->id_flag);
    sguan->motorstatus.data.temp_motor_real = userdata_driver_read_temp_motor(sguan->id_flag);
    sguan->motorstatus.data.temp_driver_real= userdata_driver_read_temp_driver(sguan->id_flag);
    sguan->motorstatus.data.temp_pcb_real   = userdata_driver_read_temp_pcb(sguan->id_flag);
    sguan->motorstatus.data.tick_run        = userdata_driver_read_tick();
    
    // 2. 依据当前工况指定运行控制模式 (默认为速度闭环控制)
    sguan->motorstatus.data.mode_flag       = CONTROL_VELOCITY;

    // 3. 执行状态机主循环：完成 196 项转移表匹配与安全保护裁决
    motorstatus_loop(sguan);
}

/* =============================================================================== */
/*                             多轴后台主循环 (Main Loop)                           */
/* =============================================================================== */

void unitlib_main_main_loop_one(SguanFoc *sguan){
    // 电机 1 后台非实时管理逻辑
}

void unitlib_main_main_loop_two(SguanFoc *sguan){
    // 电机 2 后台管理逻辑
}

void unitlib_main_main_loop_three(SguanFoc *sguan){
    // 电机 3 后台管理逻辑
}

void unitlib_main_main_loop_four(SguanFoc *sguan){
    // 电机 4 后台管理逻辑
}

void unitlib_main_main_loop_five(SguanFoc *sguan){
    // 电机 5 后台管理逻辑
}

void unitlib_main_main_loop_six(SguanFoc *sguan){
    // 电机 6 后台管理逻辑
}

/* =============================================================================== */
/*                             单轴后台主循环入口                                   */
/* =============================================================================== */
void unitlib_main_main_loop(SguanFoc *sguan){
    // 单轴模式下的后台主循环执行体
}
