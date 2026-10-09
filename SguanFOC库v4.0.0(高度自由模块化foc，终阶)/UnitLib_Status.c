#include "UnitLib_Status.h"

/**
 * @brief  待机状态 (status_standby) 周期执行动作
 * @note   电机处于停机状态，通常在此确保 PWM 下桥关断，驱动处于高阻态或低阻制动状态
 */
void unitlib_status_standby_loop(void){
    // 用户实现: 待机期间的指示灯闪烁或状态监视
}

/**
 * @brief  就绪状态 (status_ready) 周期执行动作
 * @note   系统各模块已准备就绪，等待运行使能事件触发
 */
void unitlib_status_ready_loop(void){
    // 用户实现:
}

/**
 * @brief  初始化过程中 (status_initializing / angle / current) 周期执行动作
 */
void unitlib_status_initial_loop(void){
    // 用户实现: 初始化校验逻辑
}

/* =================================================== */
/*             正常运行模态下的三类微状态动作            */
/* =================================================== */

/**
 * @brief  参数递增状态 (status_xxx_increasing) 周期执行动作
 * @note   当前控制量（转矩/速度/位置）正处于加速上升爬坡阶段
 */
void unitlib_status_increasing_loop(void){
    // 用户实现: 斜坡加减速平滑插值或指示
}

/**
 * @brief  参数递减状态 (status_xxx_decreasing) 周期执行动作
 * @note   当前控制量正处于减速下坡阶段
 */
void unitlib_status_decreasing_loop(void){
    // 用户实现:
}

/**
 * @brief  参数稳定保持状态 (status_xxx_hold) 周期执行动作
 * @note   当前控制量已到达目标值并进入稳态伺服保持
 */
void unitlib_status_hold_loop(void){
    // 用户实现: 稳态抖动监测或位置锁定
}

/* =================================================== */
/*             故障与异常保护发生时的周期动作钩子       */
/* =================================================== */

/**
 * @brief  过压保护动作 (status_overvoltage)
 * @note   母线电压 Vbus 超过设定上限 vbus_max 时触发
 */
void unitlib_status_overvoltage_loop(void){
    // 用户实现: 紧急切断 PWM，开启放电制动电阻，红灯快闪报警
}

/**
 * @brief  欠压保护动作 (status_undervoltage)
 * @note   母线电压 Vbus 低于设定下限 vbus_min 时触发
 */
void unitlib_status_undervoltage_loop(void){
    // 用户实现: 关断功率管，记录电池电量耗尽故障码
}

/**
 * @brief  过流保护动作 (status_overcurrent)
 * @note   瞬时极限过流或持续反时限过载超时触发
 */
void unitlib_status_overcurrent_loop(void){
    // 用户实现: 硬件级关断输出，锁死报警，防止 MOS 击穿
}

/**
 * @brief  电机过温保护动作 (status_overtemp_motor)
 */
void unitlib_status_overtemp_motor_loop(void){
    // 用户实现: 降低运行功率或停机降温
}

/**
 * @brief  电机过冷保护动作 (status_undertemp_motor)
 */
void unitlib_status_undertemp_motor_loop(void){
    // 用户实现:
}

/**
 * @brief  功率管驱动器过温保护动作 (status_overtemp_driver)
 */
void unitlib_status_overtemp_driver_loop(void){
    // 用户实现: 降额运行或风扇全速散热
}

/**
 * @brief  功率管驱动器过冷保护动作 (status_undertemp_driver)
 */
void unitlib_status_undertemp_driver_loop(void){
    // 用户实现:
}

/**
 * @brief  PCB 控制板过温保护动作 (status_overtemp_pcb)
 */
void unitlib_status_overtemp_pcb_loop(void){
    // 用户实现:
}

/**
 * @brief  PCB 控制板过冷保护动作 (status_undertemp_pcb)
 */
void unitlib_status_undertemp_pcb_loop(void){
    // 用户实现:
}

/**
 * @brief  机械堵转卡死保护动作 (status_stuck)
 * @note   电机电流已打满但转速持续低于阈值达 stuck_tick_delay 时触发
 */
void unitlib_status_stuck_loop(void){
    // 用户实现: 保护停机，防止持续堵转导致电机烧毁或机械牙箱打齿
}

/**
 * @brief  缺相保护动作 (status_phase_loss)
 * @note   三相中某相电流异常归零或开路时触发
 */
void unitlib_status_phase_loss_loop(void){
    // 用户实现: 切断 PWM，上报断相故障
}

/**
 * @brief  未知或通用严重故障动作 (status_fault)
 */
void unitlib_status_fault_loop(void){
    // 用户实现: 系统紧急安全自锁
}
