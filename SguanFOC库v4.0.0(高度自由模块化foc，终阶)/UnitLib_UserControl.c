#include "UnitLib_UserControl.h"

/**
 * @brief  指令处理回调函数: MOTOR (启停/使能控制)
 * @param  value: 上位机下发参数值 (例如: 1.0 为启动使能, 0.0 为停机待机)
 * @note   通信协议示例: 发送 "MOTOR=1?" 或 "MOTOR=0?"
 */
void unitlib_usercontrol_motor(float value){
    // 逻辑示例: 改变当前主电机的运行使能标志
    // if (value > 0.5f) sguanfoc[0].run_flag = RUN_READY;
    // else              sguanfoc[0].run_flag = RUN_STANDBY;
}

/**
 * @brief  指令处理回调函数: Speed (目标转速设置)
 * @param  value: 期望机械转速 (单位: rpm 或 rad/s)
 * @note   通信协议示例: 发送 "Speed=1500.0?"
 */
void unitlib_usercontrol_speed(float value){
    // 逻辑示例: 将目标转速注入当前活动电机的期望速度变量中
    // sguanfoc[0].foc.target_speed = (SguanQ)value;
}

/**
 * @brief  指令处理回调函数: Position (目标位置设置)
 * @param  value: 期望目标机械角度 (单位: rad 或 编码器计数值)
 * @note   通信协议示例: 发送 "Position=3.1415?"
 */
void unitlib_usercontrol_position(float value){
    // 逻辑示例: 设定伺服位置环的目标角度
    // sguanfoc[0].foc.target_pos = (SguanQ)value;
}

/**
 * @brief  指令处理回调函数: Id (直轴目标电流设置)
 * @param  value: 期望 d 轴电流 (单位: A)
 * @note   在表贴式 PMSM 中通常设为 0；在高速弱磁工况下设定为负值 (如 "Id=-2.0?")
 */
void unitlib_usercontrol_id(float value){
    // 逻辑示例:
    // sguanfoc[0].foc.target_id = (SguanQ)value;
}

/**
 * @brief  指令处理回调函数: Iq (交轴目标转矩电流设置)
 * @param  value: 期望 q 轴转矩电流 (单位: A)
 * @note   通信协议示例: 发送 "Iq=2.5?" (纯力矩模式调试时使用)
 */
void unitlib_usercontrol_iq(float value){
    // 逻辑示例:
    // sguanfoc[0].foc.target_iq = (SguanQ)value;
}

/**
 * @brief  指令处理回调函数: Ud (直轴开环测试电压设置)
 * @param  value: 期望 d 轴电压 (单位: V)
 * @note   通信协议示例: 发送 "Ud=2.0?" (用于直流电压对齐标定电角度零点)
 */
void unitlib_usercontrol_ud(float value){
    // 逻辑示例:
    // sguanfoc[0].foc.target_ud = (SguanQ)value;
}

/**
 * @brief  指令处理回调函数: Uq (交轴开环测试电压设置)
 * @param  value: 期望 q 轴电压 (单位: V)
 * @note   通信协议示例: 发送 "Uq=3.0?" (用于电压开环开机旋转测试)
 */
void unitlib_usercontrol_uq(float value){
    // 逻辑示例:
    // sguanfoc[0].foc.target_uq = (SguanQ)value;
}
