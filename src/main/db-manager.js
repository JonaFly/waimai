/**
 * 数据库管理模块
 * 负责创建和管理SQLite数据库，提供存储和读取cookies的功能
 */

const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

class DbManager {
  /**
   * 构造函数
   * @param {string} encryptionKey - 用于加密数据的密钥
   */
  constructor(encryptionKey) {
    if (!encryptionKey) {
      throw new Error('加密密钥不能为空');
    }
    
    this.encryptionKey = encryptionKey;
    this.db = null;
    this.initialized = false;
    
    // 添加数据库路径定义
    this.dbPath = path.join(app.getPath('userData'), 'database.sqlite');
    console.log(`数据库路径: ${this.dbPath}`);
    
    // 初始化数据库
    this.initPromise = this.init().catch(err => {
      console.error('数据库初始化失败:', err);
      // 在初始化失败时设置标志，以便其他方法可以检查
      this.initFailed = true;
    });
  }
  
  /**
   * 初始化数据库
   * @returns {Promise<boolean>} 是否成功
   */
  async init() {
    try {
      // 确保我们有有效的数据库路径
      if (!this.dbPath) {
        this.dbPath = path.join(app.getPath('userData'), 'database.sqlite');
        console.log(`数据库路径未设置，使用默认路径: ${this.dbPath}`);
      }
      
      // 确保数据目录存在
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        try {
          fs.mkdirSync(dbDir, { recursive: true });
          console.log(`创建数据库目录: ${dbDir}`);
        } catch (mkdirErr) {
          console.error(`创建数据库目录失败: ${mkdirErr.message}`);
          throw new Error(`无法创建数据库目录: ${mkdirErr.message}`);
        }
      }

      // 检查数据库文件权限
      let needNewDb = false;
      if (fs.existsSync(this.dbPath)) {
        try {
          fs.accessSync(this.dbPath, fs.constants.R_OK | fs.constants.W_OK);
          console.log(`数据库文件权限检查通过: ${this.dbPath}`);
        } catch (accessErr) {
          console.error(`数据库文件权限错误: ${accessErr.message}`);
          
          // 备份旧数据库文件
          const backupPath = `${this.dbPath}.${Date.now()}.bak`;
          try {
            fs.copyFileSync(this.dbPath, backupPath);
            console.log(`数据库文件已备份到: ${backupPath}`);
            
            // 尝试删除旧文件
            fs.unlinkSync(this.dbPath);
            console.log(`删除只读数据库文件: ${this.dbPath}`);
            needNewDb = true;
          } catch (backupErr) {
            console.error(`备份或删除数据库文件失败: ${backupErr.message}`);
            throw new Error(`无法备份或删除数据库文件: ${backupErr.message}`);
          }
        }
      } else {
        console.log(`数据库文件不存在，将创建新文件: ${this.dbPath}`);
        needNewDb = true;
      }

      // 使用重试机制建立数据库连接
      let retryCount = 0;
      const maxRetries = 3;
      let lastError;

      while (retryCount < maxRetries) {
        try {
          if (this.db) {
            try {
              this.db.close();
            } catch (e) {
              // 忽略关闭错误
            }
            this.db = null;
          }
          
          console.log(`尝试连接数据库 (尝试 ${retryCount + 1}/${maxRetries}): ${this.dbPath}`);
          this.db = new Database(this.dbPath, { 
            fileMustExist: false,
            // 如果需要，可以添加其他选项
            verbose: console.log // 添加日志记录
          });
          
          // 启用WAL模式以提高性能和并发性
          this.db.pragma('journal_mode = WAL');
          console.log('数据库已启用WAL模式');
          
          // 设置外键约束
          this.db.pragma('foreign_keys = ON');
          console.log('数据库已启用外键约束');
          
          // 创建表结构
          await this.createTables();
          
          // 尝试修复表结构，确保字段名匹配
          await this.repairTableStructure();
          
          this.initialized = true;
          console.log('数据库初始化完成');
          return true;
        } catch (error) {
          lastError = error;
          console.error(`数据库连接失败 (尝试 ${retryCount + 1}/${maxRetries}): ${error.message}`);
          
          // 如果是只读错误，尝试创建新的数据库文件
          if (error.code === 'SQLITE_CANTOPEN' || error.code === 'SQLITE_READONLY') {
            console.log('检测到只读错误，尝试创建新数据库文件');
            try {
              if (fs.existsSync(this.dbPath)) {
                const backupPath = `${this.dbPath}.${Date.now()}.readonly.bak`;
                fs.copyFileSync(this.dbPath, backupPath);
                console.log(`数据库文件已备份到: ${backupPath}`);
                fs.unlinkSync(this.dbPath);
                console.log(`已删除只读数据库文件: ${this.dbPath}`);
              }
            } catch (fileError) {
              console.error(`处理只读数据库文件失败: ${fileError.message}`);
            }
          }
          
          retryCount++;
          if (retryCount < maxRetries) {
            const delay = 1000 * retryCount; // 逐渐增加延迟
            console.log(`等待 ${delay}ms 后重试...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // 所有重试均失败，尝试创建内存数据库作为后备方案
      console.error(`无法连接到数据库 ${this.dbPath}，将使用内存数据库: ${lastError.message}`);
      try {
        this.db = new Database(':memory:');
        await this.createTables();
        this.initialized = true;
        console.log('已创建内存数据库（临时）');
        return true;
      } catch (memError) {
        console.error(`创建内存数据库失败: ${memError.message}`);
        this.initialized = false;
        throw new Error(`无法创建内存数据库: ${memError.message}`);
      }
    } catch (error) {
      console.error('数据库初始化失败:', error);
      this.initialized = false;
      throw error; // 重新抛出错误以便上层处理
    }
  }
  
  /**
   * 修复表结构
   * 确保字段名称正确，避免错误
   */
  async repairTableStructure() {
    try {
      if (!this.db) {
        console.warn('数据库未初始化，无法修复表结构');
        return false;
      }
      
      console.log('检查并修复数据库表结构...');
      
      // 检查accounts表是否存在
      const accountsTable = this.db.prepare(`SELECT name FROM sqlite_master 
        WHERE type='table' AND name='accounts'`).get();
        
      if (!accountsTable) {
        console.log('accounts表不存在，将创建表结构');
        await this.createAccountsTable();
        return true;
      }
      
      // 检查accounts表中是否有lastLoginTime字段
      try {
        const hasLastLoginTime = this.db.prepare(`SELECT lastLoginTime FROM accounts LIMIT 1`).get();
        console.log('accounts表结构检查完成，表结构正常');
        return true;
      } catch (err) {
        if (err.message.includes('no such column')) {
          console.warn('检测到缺少字段，尝试修复表结构...');
          
          // 获取表信息
          const tableInfo = this.db.prepare(`PRAGMA table_info(accounts)`).all();
          console.log('当前accounts表结构:', tableInfo.map(col => col.name).join(', '));
          
          // 备份原表数据
          const tempTableName = `accounts_backup_${Date.now()}`;
          this.db.exec(`CREATE TABLE ${tempTableName} AS SELECT * FROM accounts`);
          console.log(`已将accounts表数据备份到临时表: ${tempTableName}`);
          
          // 删除原表并重建
          this.db.exec(`DROP TABLE accounts`);
          await this.createAccountsTable();
          console.log('已重建accounts表结构');
          
          // 尝试恢复数据
          try {
            // 获取新表的列名
            const newColumns = this.db.prepare(`PRAGMA table_info(accounts)`).all().map(col => col.name);
            
            // 获取旧表的列名
            const oldColumns = this.db.prepare(`PRAGMA table_info(${tempTableName})`).all().map(col => col.name);
            
            // 找出两个表中共同的列
            const commonColumns = oldColumns.filter(col => newColumns.includes(col));
            
            if (commonColumns.length > 0) {
              const columnsStr = commonColumns.join(', ');
              this.db.exec(`INSERT INTO accounts (${columnsStr}) SELECT ${columnsStr} FROM ${tempTableName}`);
              console.log(`已从备份表恢复 ${commonColumns.length} 个字段的数据`);
            }
            
            // 删除临时表
            this.db.exec(`DROP TABLE ${tempTableName}`);
            console.log('数据恢复完成，已删除临时表');
            return true;
          } catch (restoreErr) {
            console.error('恢复数据过程中出错:', restoreErr);
            return false;
          }
        } else {
          console.error('检查表结构时出错:', err);
          return false;
        }
      }
    } catch (error) {
      console.error('修复表结构失败:', error);
      return false;
    }
  }
  
  /**
   * 创建所需的表结构
   * @returns {Promise<void>}
   */
  async createTables() {
    // 创建cookies表
    await this.runWithRetry(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS cookies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id TEXT NOT NULL,
          platform TEXT NOT NULL,
          username TEXT NOT NULL,
          data TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cookies_account_id ON cookies(account_id);
      `);
      console.log('cookies表已创建');
    });
    
    // 创建accounts表
    await this.createAccountsTable();
  }
  
  /**
   * 加密数据
   * @param {string} data - 要加密的数据
   * @returns {string} - 加密后的数据
   */
  encryptData(data) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(this.encryptionKey.padEnd(32).slice(0, 32)), iv);
      
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      console.error('数据加密失败:', error);
      throw error;
    }
  }
  
  /**
   * 解密数据
   * @param {string} encryptedData - 加密的数据
   * @returns {string} - 解密后的数据
   */
  decryptData(encryptedData) {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 2) {
        throw new Error('加密数据格式无效');
      }
      
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(this.encryptionKey.padEnd(32).slice(0, 32)), iv);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('数据解密失败:', error);
      throw error;
    }
  }
  
  /**
   * 保存cookies到数据库
   * @param {string} accountId - 账号ID
   * @param {string} platform - 平台
   * @param {string} username - 用户名
   * @param {Array} cookiesData - cookies数据
   * @returns {Promise<boolean>} - 保存是否成功
   */
  async saveCookies(accountId, platform, username, cookiesData) {
    try {
      // 等待数据库初始化完成
      if (this.initPromise) {
        await this.initPromise;
      }
      
      if (!this.initialized || !this.db) {
        console.error('数据库未初始化，无法保存cookies');
        return false;
      }
      
      if (!accountId || !platform || !username || !cookiesData) {
        console.error('保存cookies所需参数不完整');
        return false;
      }
      
      // 加密cookie数据
      const encryptedData = this.encryptData(JSON.stringify(cookiesData));
      
      // 获取当前时间
      const now = new Date().toISOString();
      
      // 检查是否已存在该账号的cookies
      const existingCookie = this.db.prepare('SELECT id FROM cookies WHERE account_id = ?').get(accountId);
      
      // 准备语句
      let stmt;
      if (existingCookie) {
        // 更新现有记录
        stmt = this.db.prepare(`
          UPDATE cookies 
          SET platform = ?, username = ?, data = ?, updated_at = ? 
          WHERE account_id = ?
        `);
        stmt.run(platform, username, encryptedData, now, accountId);
      } else {
        // 插入新记录
        stmt = this.db.prepare(`
          INSERT INTO cookies (account_id, platform, username, data, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run(accountId, platform, username, encryptedData, now, now);
      }
      
      console.log(`成功保存账号 ${username}(${platform}) 的 ${cookiesData.length} 个cookies到数据库`);
      return true;
    } catch (error) {
      console.error(`保存cookies到数据库失败:`, error);
      return false;
    }
  }
  
  /**
   * 从数据库加载cookies
   * @param {string} accountId - 账号ID
   * @returns {Promise<Array|null>} - cookies数据，失败时返回null
   */
  async loadCookies(accountId) {
    try {
      // 等待数据库初始化完成
      if (this.initPromise) {
        await this.initPromise;
      }
      
      if (!this.initialized || !this.db) {
        console.error('数据库未初始化，无法加载cookies');
        return null;
      }
      
      if (!accountId) {
        console.error('加载cookies失败：账号ID为空');
        return null;
      }
      
      // 准备查询
      const stmt = this.db.prepare('SELECT data, username, platform FROM cookies WHERE account_id = ?');
      const row = stmt.get(accountId);
      
      if (!row) {
        console.log(`数据库中没有找到账号ID ${accountId} 的cookies`);
        return null;
      }
      
      // 解密数据
      try {
        const decryptedData = this.decryptData(row.data);
        const cookies = JSON.parse(decryptedData);
        
        console.log(`成功从数据库加载账号 ${row.username}(${row.platform}) 的 ${cookies.length} 个cookies`);
        return cookies;
      } catch (decryptError) {
        console.error(`解密或解析cookies数据失败:`, decryptError);
        return null;
      }
    } catch (error) {
      console.error(`从数据库加载cookies失败:`, error);
      return null;
    }
  }
  
  /**
   * 删除账号的cookies
   * @param {string} accountId - 账号ID
   * @returns {Promise<boolean>} - 是否成功删除
   */
  async deleteCookies(accountId) {
    try {
      // 等待数据库初始化完成
      if (this.initPromise) {
        await this.initPromise;
      }
      
      if (!this.initialized || !this.db) {
        console.error('数据库未初始化，无法删除cookies');
        return false;
      }
      
      if (!accountId) {
        console.error('删除cookies失败：账号ID为空');
        return false;
      }
      
      // 准备删除语句
      const stmt = this.db.prepare('DELETE FROM cookies WHERE account_id = ?');
      const info = stmt.run(accountId);
      
      console.log(`删除账号ID ${accountId} 的cookies, 影响行数: ${info.changes}`);
      return info.changes > 0;
    } catch (error) {
      console.error(`删除cookies失败:`, error);
      return false;
    }
  }
  
  /**
   * 保存账号到数据库
   * @param {Object} account 账号对象
   * @returns {Promise<boolean>} 是否成功
   */
  async saveAccount(account) {
    try {
      if (!this.db || !this.initialized) {
        console.warn('数据库未初始化，无法保存账号');
        return false;
      }
      
      // 确保账号表存在并且结构正确
      await this.repairTableStructure();
      
      // 准备数据，将对象转为JSON字符串
      const data = typeof account.data === 'object' 
        ? JSON.stringify(account.data) 
        : account.data || null;
        
      const cookies = Array.isArray(account.cookies) 
        ? JSON.stringify(account.cookies) 
        : account.cookies || null;
      
      // 检查账号是否已存在
      let existingAccount;
      try {
        existingAccount = await this.runWithRetry(() => {
          return this.db.prepare('SELECT id FROM accounts WHERE id = ?').get(account.id);
        });
      } catch (err) {
        console.error(`检查账号是否存在时出错:`, err);
        // 如果出错，假设账号不存在
        existingAccount = null;
      }
      
      try {
        if (existingAccount) {
          // 更新现有账号
          const sql = `
            UPDATE accounts 
            SET 
              platform = ?, 
              username = ?, 
              nickname = ?, 
              status = ?, 
              lastLoginTime = ?, 
              data = ?,
              cookies = ?,
              updatedAt = ?
            WHERE id = ?
          `;
          
          await this.runWithRetry(() => {
            return this.db.prepare(sql).run(
              account.platform,
              account.username,
              account.nickname || null,
              account.status || 'inactive',
              account.lastLoginTime || null,
              data,
              cookies,
              new Date().toISOString(),
              account.id
            );
          });
        } else {
          // 插入新账号
          const sql = `
            INSERT INTO accounts (
              id, platform, username, nickname, status, 
              lastLoginTime, data, cookies, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          
          await this.runWithRetry(() => {
            return this.db.prepare(sql).run(
              account.id,
              account.platform,
              account.username,
              account.nickname || null,
              account.status || 'inactive',
              account.lastLoginTime || null,
              data,
              cookies,
              account.createdAt || new Date().toISOString(),
              new Date().toISOString()
            );
          });
        }
        
        return true;
      } catch (sqlError) {
        console.error('执行SQL语句时出错:', sqlError);
        
        // 检查是否是表结构问题，如果是，尝试修复表结构
        if (sqlError.message.includes('no such column')) {
          console.log('检测到表结构问题，尝试修复...');
          const fixResult = await this.repairTableStructure();
          
          if (fixResult) {
            // 修复成功后再次尝试保存
            console.log('表结构已修复，重新尝试保存账号...');
            return await this.saveAccount(account);
          }
        }
        
        return false;
      }
    } catch (error) {
      console.error('保存账号到数据库失败:', error);
      return false;
    }
  }
  
  /**
   * 创建账号表
   */
  async createAccountsTable() {
    try {
      if (!this.db) {
        console.warn('数据库未初始化，无法创建账号表');
        return false;
      }
      
      const sql = `
        CREATE TABLE IF NOT EXISTS accounts (
          id TEXT PRIMARY KEY,
          platform TEXT NOT NULL,
          username TEXT NOT NULL,
          nickname TEXT,
          status TEXT DEFAULT 'inactive',
          lastLoginTime TEXT,
          lastActiveTime TEXT,
          data TEXT,
          cookies TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        )
      `;
      
      await this.runWithRetry(() => {
        return this.db.prepare(sql).run();
      });
      
      console.log('确保账号表已创建');
      return true;
    } catch (error) {
      console.error('创建账号表失败:', error);
      return false;
    }
  }
  
  /**
   * 从数据库加载所有账号
   * @returns {Promise<Array>} 账号列表
   */
  async loadAccounts() {
    try {
      if (!this.db || !this.initialized) {
        console.warn('数据库未初始化，无法加载账号');
        return [];
      }
      
      // 确保账号表存在
      await this.repairTableStructure();
      
      // 检查表是否存在
      const tableExists = await this.runWithRetry(() => {
        const result = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'").get();
        return !!result;
      });
      
      if (!tableExists) {
        console.log('账号表不存在，创建表...');
        await this.createAccountsTable();
        return [];
      }
      
      try {
        const sql = `SELECT * FROM accounts`;
        const accounts = await this.runWithRetry(() => {
          return this.db.prepare(sql).all();
        });
        
        if (!Array.isArray(accounts)) {
          console.warn('从数据库加载的账号不是数组格式');
          return [];
        }
        
        console.log(`从数据库加载了 ${accounts.length} 个账号`);
        
        // 处理可能的JSON字段
        return accounts.map(account => {
          try {
            // 尝试解析可能的JSON字段
            if (account.data && typeof account.data === 'string') {
              account.data = JSON.parse(account.data);
            }
            if (account.cookies && typeof account.cookies === 'string') {
              account.cookies = JSON.parse(account.cookies);
            }
            return account;
          } catch (e) {
            console.error(`解析账号 ${account.id} 的JSON字段失败:`, e);
            return account;
          }
        });
      } catch (sqlError) {
        console.error('执行SQL查询时出错:', sqlError);
        
        // 检查是否是表结构问题
        if (sqlError.message.includes('no such column') || 
            sqlError.message.includes('no such table')) {
          console.log('检测到表结构问题，尝试修复...');
          await this.repairTableStructure();
          
          // 修复后重新尝试一次
          const accounts = await this.runWithRetry(() => {
            return this.db.prepare('SELECT * FROM accounts').all();
          });
          
          return Array.isArray(accounts) ? accounts : [];
        }
        
        return [];
      }
    } catch (error) {
      console.error('从数据库加载账号失败:', error);
      // 不抛出异常，而是返回空数组
      return [];
    }
  }
  
  /**
   * 删除账号
   * @param {string} accountId - 账号ID
   * @returns {boolean} - 是否成功删除
   */
  deleteAccount(accountId) {
    try {
      if (!this.initialized || !this.db) {
        throw new Error('数据库未初始化');
      }
      
      if (!accountId) {
        throw new Error('账号ID不能为空');
      }
      
      // 开始事务
      const transaction = this.db.transaction(() => {
        // 删除账号
        const accountStmt = this.db.prepare('DELETE FROM accounts WHERE id = ?');
        const accountResult = accountStmt.run(accountId);
        
        // 删除cookies
        const cookiesStmt = this.db.prepare('DELETE FROM cookies WHERE account_id = ?');
        const cookiesResult = cookiesStmt.run(accountId);
        
        return {
          accountDeleted: accountResult.changes > 0,
          cookiesDeleted: cookiesResult.changes > 0
        };
      });
      
      const result = transaction();
      
      console.log(`删除账号ID ${accountId}: 账号删除=${result.accountDeleted}, cookies删除=${result.cookiesDeleted}`);
      return result.accountDeleted;
    } catch (error) {
      console.error(`删除账号失败:`, error);
      return false;
    }
  }
  
  /**
   * 在事务中执行数据库操作
   * @param {Function} operation - 要执行的操作函数
   * @returns {any} - 操作结果
   */
  runInTransaction(operation) {
    try {
      if (!this.initialized || !this.db) {
        throw new Error('数据库未初始化');
      }
      
      // 创建事务
      const transaction = this.db.transaction(operation);
      return transaction();
    } catch (error) {
      console.error('事务执行失败:', error);
      throw error;
    }
  }
  
  /**
   * 尝试修复数据库连接
   * @returns {boolean} - 是否成功修复
   */
  repairConnection() {
    try {
      if (this.db) {
        try {
          this.db.close();
        } catch (e) {
          console.warn('关闭损坏的数据库连接失败:', e);
        }
        this.db = null;
      }
      
      this.initialized = false;
      this.init();
      return this.initialized;
    } catch (error) {
      console.error('修复数据库连接失败:', error);
      return false;
    }
  }
  
  /**
   * 关闭数据库连接
   */
  close() {
    if (this.db) {
      try {
        // 检查数据库是否为只读
        let isReadOnly = false;
        try {
          // 尝试执行一个简单的写操作来检查是否只读
          this.db.prepare('CREATE TABLE IF NOT EXISTS _test_write_access (id INTEGER PRIMARY KEY)').run();
          this.db.prepare('DROP TABLE IF EXISTS _test_write_access').run();
        } catch (err) {
          if (err.code === 'SQLITE_READONLY' || err.code === 'SQLITE_READONLY_DBMOVED') {
            isReadOnly = true;
            console.log('检测到只读数据库，跳过关闭前的写操作');
          } else {
            console.warn('检查数据库权限时出错:', err);
          }
        }
        
        // 只有非只读数据库才尝试切换模式
        if (!isReadOnly && this.initialized) {
          try {
            // 尝试切换回删除模式，降低文件损坏风险
            this.db.pragma('journal_mode = DELETE');
            console.log('数据库已切换为安全关闭模式');
          } catch (pragmaError) {
            // 忽略此错误，继续关闭过程
            console.warn('切换数据库关闭模式失败:', pragmaError);
          }
        }
        
        // 关闭数据库连接
        this.db.close();
        console.log('数据库连接已关闭');
      } catch (error) {
        console.error('关闭数据库连接失败:', error);
      } finally {
        // 确保无论如何都重置状态
        this.db = null;
        this.initialized = false;
      }
    } else {
      console.log('数据库连接已经关闭或不存在');
    }
  }

  /**
   * 使用重试机制执行数据库操作
   * @param {Function} operation 要执行的数据库操作函数
   * @param {number} maxRetries 最大重试次数
   * @param {number} delay 重试之间的延迟时间 (毫秒)
   * @returns {Promise<any>} 操作结果
   */
  async runWithRetry(operation, maxRetries = 3, delay = 300) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 尝试执行操作
        const result = operation();
        return result;
      } catch (error) {
        lastError = error;
        
        // 判断是否是可重试的错误
        const isRetryable = 
          error.code === 'SQLITE_BUSY' || 
          error.code === 'SQLITE_LOCKED' ||
          error.code === 'SQLITE_PROTOCOL';
        
        if (!isRetryable || attempt === maxRetries) {
          // 如果不可重试或已达到最大重试次数，抛出错误
          break;
        }
        
        console.warn(`数据库操作失败(${error.code})，${attempt}/${maxRetries} 次重试: ${error.message}`);
        
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
    
    // 所有重试都失败，抛出最后一个错误
    console.error(`数据库操作失败，已重试 ${maxRetries} 次: ${lastError.message}`);
    throw lastError;
  }
}

module.exports = DbManager; 