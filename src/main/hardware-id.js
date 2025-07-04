const { machineIdSync } = require('node-machine-id');
const os = require('os');
const crypto = require('crypto');

/**
 * 硬件ID生成器
 * 用于生成唯一的机器标识符，用于软件激活
 */
class HardwareIdGenerator {
  /**
   * 获取硬件唯一标识符
   * @returns {string} 硬件ID
   */
  static getHardwareId() {
    try {
      // 尝试获取机器ID
      const machineId = machineIdSync();
      
      // 获取系统信息
      const hostname = os.hostname();
      const platform = os.platform();
      const cpus = os.cpus().length;
      
      // 组合信息并创建哈希
      const dataToHash = `${machineId}-${hostname}-${platform}-${cpus}`;
      const hash = crypto.createHash('sha256').update(dataToHash).digest('hex');
      
      // 取前16位作为硬件ID，更容易阅读
      return hash.substring(0, 16).toUpperCase();
    } catch (error) {
      console.error('获取硬件ID失败:', error);
      
      // 备用方案：使用操作系统信息生成ID
      const fallbackData = `${os.hostname()}-${os.platform()}-${os.arch()}-${os.totalmem()}`;
      const fallbackHash = crypto.createHash('sha256').update(fallbackData).digest('hex');
      
      return fallbackHash.substring(0, 16).toUpperCase();
    }
  }
  
  /**
   * 验证硬件ID是否与当前机器匹配
   * @param {string} storedId 存储的硬件ID
   * @returns {boolean} 是否匹配
   */
  static validateHardwareId(storedId) {
    if (!storedId) return false;
    
    const currentId = this.getHardwareId();
    return currentId === storedId;
  }
}

module.exports = HardwareIdGenerator; 