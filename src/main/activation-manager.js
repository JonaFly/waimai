const crypto = require('crypto');

class ActivationManager {
  constructor(dbManager, secretKey = 'g7NqT9Aw3K5sV8yP') {
    this.db = dbManager;
    this.secretKey = secretKey;
    this.initTable();
  }
  
  /**
   * 初始化激活表
   */
  async initTable() {
    try {
      await this.db.db.exec(`
        CREATE TABLE IF NOT EXISTS activations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          activationCode TEXT NOT NULL,
          activationDate TEXT NOT NULL,
          expiryDate TEXT NOT NULL,
          isActive INTEGER DEFAULT 1
        )
      `);
      console.log('激活数据表初始化成功');
    } catch (error) {
      console.error('创建激活表失败:', error);
    }
  }
  
  /**
   * 检查软件是否已激活
   * @returns {Object} 激活状态信息
   */
  async checkActivation() {
    try {
      // 查找有效激活记录
      const activation = this.db.db.prepare(`
        SELECT * FROM activations 
        WHERE expiryDate > ? AND isActive = 1
        ORDER BY expiryDate DESC LIMIT 1
      `).get(new Date().toISOString());
      
      if (!activation) {
        return { 
          activated: false, 
          message: '软件未激活，请输入激活码'
        };
      }
      
      // 计算剩余时间
      const expiryDate = new Date(activation.expiryDate);
      const today = new Date();
      const hoursLeft = Math.ceil((expiryDate - today) / (1000 * 60 * 60));
      const daysLeft = Math.ceil(hoursLeft / 24);
      
      // 判断是否是永久激活
      const isPermanent = daysLeft > 36500; // 超过100年视为永久
      
      let message;
      if (isPermanent) {
        message = '软件已永久激活';
      } else if (hoursLeft < 24) {
        message = `软件已激活，剩余${hoursLeft}小时`;
      } else {
        message = `软件已激活，剩余${daysLeft}天`;
      }
      
      return {
        activated: true,
        expiryDate: activation.expiryDate,
        daysLeft,
        hoursLeft,
        isPermanent,
        message
      };
    } catch (error) {
      console.error('检查激活状态失败:', error);
      return { 
        activated: false, 
        message: '检查激活状态时出错',
        error: error.message
      };
    }
  }
  
  /**
   * 激活软件
   * @param {string} activationCode 激活码
   * @returns {Object} 激活结果
   */
  activateSoftware(activationCode) {
    try {
      // 验证激活码格式
      activationCode = activationCode.trim();
      if (!this.isValidActivationCodeFormat(activationCode)) {
        return { success: false, message: '激活码格式错误' };
      }
      
      // 解析激活码
      const result = this.decodeActivationCode(activationCode);
      if (!result.valid) {
        return { success: false, message: result.message };
      }
      
      // 检查激活码是否已使用
      const existingActivation = this.db.db.prepare(`
        SELECT * FROM activations WHERE activationCode = ?
      `).get(activationCode);
      
      if (existingActivation) {
        return { success: false, message: '此激活码已被使用' };
      }
      
      // 设置到期日期
      const expiryDate = new Date(result.data.expires);
      const today = new Date();
      const hoursLeft = Math.ceil((expiryDate - today) / (1000 * 60 * 60));
      const daysLeft = Math.ceil(hoursLeft / 24);
      
      // 保存激活记录
      this.db.db.prepare(`
        INSERT INTO activations (activationCode, activationDate, expiryDate)
        VALUES (?, ?, ?)
      `).run(
        activationCode,
        today.toISOString(),
        expiryDate.toISOString()
      );
      
      // 判断是否是永久激活
      const isPermanent = result.data.unit === 'permanent' || daysLeft > 36500; // 超过100年视为永久
      
      // 根据剩余时间生成合适的消息
      let message;
      if (isPermanent) {
        message = '软件已永久激活';
      } else if (hoursLeft < 24) {
        message = `激活成功，有效期${hoursLeft}小时`;
      } else {
        message = `激活成功，有效期${daysLeft}天`;
      }
      
      return {
        success: true,
        message,
        expiryDate: expiryDate.toISOString(),
        daysLeft,
        hoursLeft,
        isPermanent
      };
    } catch (error) {
      console.error('激活软件失败:', error);
      return { 
        success: false, 
        message: '激活过程中出错',
        error: error.message
      };
    }
  }
  
  /**
   * 验证激活码格式
   * @param {string} code 激活码
   * @returns {boolean} 是否有效
   */
  isValidActivationCodeFormat(code) {
    // 移除连字符，然后验证是否是Base64格式
    const cleanCode = code.replace(/-/g, '');
    // 简单检查是否可能是Base64格式 (不需要严格验证，在解码时会进一步验证)
    return /^[A-Za-z0-9+/=]+$/.test(cleanCode);
  }
  
  /**
   * 解码激活码
   * @param {string} code 激活码
   * @returns {Object} 解码结果
   */
  decodeActivationCode(code) {
    try {
      // 移除连字符
      const cleanCode = code.replace(/-/g, '');
      
      // 尝试解码Base64
      let jsonString;
      try {
        jsonString = atob(cleanCode);
      } catch (e) {
        return { valid: false, message: '激活码格式无效' };
      }
      
      // 解析JSON数据
      let data;
      try {
        data = JSON.parse(jsonString);
      } catch (e) {
        return { valid: false, message: '激活码数据无效' };
      }
      
      // 验证必要字段
      if (!data.customer || !data.created || !data.expires || !data.checksum) {
        return { valid: false, message: '激活码缺少必要数据' };
      }
      
      // 验证校验和
      const originalData = { ...data };
      delete originalData.checksum;
      const expectedChecksum = this.calculateChecksum(JSON.stringify(originalData) + this.secretKey);
      
      if (expectedChecksum !== data.checksum) {
        return { valid: false, message: '激活码无效或已被篡改' };
      }
      
      // 验证过期时间
      const expiryDate = new Date(parseInt(data.expires) || data.expires);
      const now = new Date();
      if (expiryDate < now) {
        return { valid: false, message: '激活码已过期' };
      }
      
      return {
        valid: true,
        data: data
      };
    } catch (error) {
      console.error('解码激活码失败:', error);
      return { valid: false, message: '解码激活码时出错' };
    }
  }
  
  /**
   * 计算校验和
   * @param {string} str 输入字符串
   * @returns {string} 校验和
   */
  calculateChecksum(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0; // 转换为 32 位整数
    }
    return Math.abs(hash).toString(16);
  }
}

module.exports = { ActivationManager }; 