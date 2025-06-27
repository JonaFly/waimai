const { contextBridge, ipcRenderer } = require('electron');

// 这个预加载脚本用于浏览器窗口
// 可以在这里注入辅助脚本，但为了安全起见，我们不暴露任何IPC通信
contextBridge.exposeInMainWorld('waimaiHelper', {
  version: '1.0.0'
});

// 为独立浏览器窗口提供预加载功能
// 这里可以加入自定义脚本，例如自动填写表单等功能

contextBridge.exposeInMainWorld('accountBrowser', {
  // 获取当前窗口ID
  getWindowId: () => {
    const userAgent = navigator.userAgent;
    const partitionMatch = userAgent.match(/Electron\/[^ ]+ \(.*partition=persist:(.*?)(&|$)/);
    return partitionMatch ? partitionMatch[1] : null;
  },
  
  // 设置窗口ID (由主进程调用)
  setWindowId: (windowId) => {
    console.log(`窗口ID已设置: ${windowId}`);
    window._windowId = windowId;
    return true;
  },
  
  // 获取当前网站域名
  getDomain: () => {
    return window.location.origin;
  },
  
  // 向主进程发送消息
  sendMessage: (channel, data) => {
    ipcRenderer.send('browser-message', {
      channel,
      data
    });
  },
  
  // 更新登录状态
  updateLoginStatus: (status, username, platform) => {
    ipcRenderer.send('login-status-update', {
      status,
      username,
      platform,
      timestamp: Date.now()
    });
  }
});

// 直接暴露ipcRenderer的send方法，确保消息能够发送到主进程
contextBridge.exposeInMainWorld('electronAPI', {
  sendToMain: (channel, data) => {
    ipcRenderer.send(channel, data);
  }
});

/**
 * 检查页面中是否包含指定文本
 * @param {string} text 要检查的文本
 * @returns {boolean} 是否存在
 */
function isTextPresent(text) {
  try {
    const bodyText = document.body.innerText || '';
    return bodyText.includes(text);
  } catch (e) {
    console.error('检查文本存在出错:', e);
    return false;
  }
}

/**
 * 检查登录状态
 */
function checkLoginStatus() {
  try {
    // 获取当前URL
    const currentUrl = window.location.href;
    const hostname = window.location.hostname;
    
    // 检测是否在登录页面
    const isLoginPage = 
      currentUrl.includes('/login') || 
      currentUrl.includes('/signin') || 
      currentUrl.includes('/passport') ||
      isTextPresent('登录') && (isTextPresent('密码') || isTextPresent('验证码'));
    
    // 检测是否已登录的多种指标
    let isLoggedIn = false;
    let platform = '';
    let loginIndicator = '';
    
    // 美团外卖商家端
    if (hostname.includes('meituan.com') || hostname.includes('sankuai.com')) {
      platform = 'meituan';
      
      // 检查多种登录状态指示器
      const indicators = [
        { selector: '.mt-component-nav', name: '导航栏' },
        { selector: '.mt-component-layout', name: '布局组件' },
        { selector: '.header-user-info', name: '用户信息' },
        { selector: '.merchant-dashboard', name: '商家面板' },
        { selector: '.merchant-header', name: '商家头部' },
        { selector: '.merchant-content', name: '商家内容' },
        { selector: '.order-list', name: '订单列表' },
        { text: '全部门店', name: '全部门店文本' },
        { text: '商家中心', name: '商家中心文本' },
        { text: '账号管理', name: '账号管理文本' }
      ];
      
      // 检查各种指示器
      for (const indicator of indicators) {
        if (indicator.selector && document.querySelector(indicator.selector)) {
          isLoggedIn = true;
          loginIndicator = indicator.name;
          break;
        } else if (indicator.text && isTextPresent(indicator.text)) {
          isLoggedIn = true;
          loginIndicator = indicator.name;
          break;
        }
      }
      
      // 检查URL特征
      if (!isLoggedIn) {
        if (
          currentUrl.includes('/business/') || 
          currentUrl.includes('/v2/index') ||
          currentUrl.includes('/dashboard')
        ) {
          isLoggedIn = true;
          loginIndicator = 'URL特征';
        }
      }
    }
    
    // 京东到家商家端
    else if (hostname.includes('jd.com') || hostname.includes('daojia')) {
      platform = 'jingdong';
      
      // 检查多种登录状态指示器
      const indicators = [
        { selector: '.jddj-header', name: '京东到家头部' },
        { selector: '.user-info', name: '用户信息' },
        { selector: '.merchant-panel', name: '商家面板' },
        { selector: '.order-management', name: '订单管理' },
        { text: '商家中心', name: '商家中心文本' },
        { text: '订单管理', name: '订单管理文本' },
        { text: '商品管理', name: '商品管理文本' }
      ];
      
      // 检查各种指示器
      for (const indicator of indicators) {
        if (indicator.selector && document.querySelector(indicator.selector)) {
          isLoggedIn = true;
          loginIndicator = indicator.name;
          break;
        } else if (indicator.text && isTextPresent(indicator.text)) {
          isLoggedIn = true;
          loginIndicator = indicator.name;
          break;
        }
      }
      
      // 检查URL特征
      if (!isLoggedIn) {
        if (
          currentUrl.includes('/merchant') || 
          currentUrl.includes('/dashboard') ||
          currentUrl.includes('/home')
        ) {
          isLoggedIn = true;
          loginIndicator = 'URL特征';
        }
      }
    }
    
    // 检查是否存在登出指示器
    const logoutIndicators = [
      { text: '登录已过期', name: '登录已过期' },
      { text: '请重新登录', name: '请重新登录' },
      { text: '登录超时', name: '登录超时' },
      { text: '会话已过期', name: '会话已过期' },
      { text: '安全退出', name: '安全退出' }
    ];
    
    // 如果在已登录状态下发现登出指示器，则认为已登出
    if (isLoggedIn) {
      for (const indicator of logoutIndicators) {
        if (indicator.text && isTextPresent(indicator.text)) {
          isLoggedIn = false;
          console.log(`检测到登出指示器: ${indicator.name}`);
          break;
        }
      }
    }
    
    // 尝试获取用户名
    let username = '';
    try {
      // 尝试从页面元素中获取用户名
      const usernameSelectors = [
        'input[name="username"]',
        '.username',
        '.user-name',
        '.account-name',
        '.header-username'
      ];
      
      for (const selector of usernameSelectors) {
        const element = document.querySelector(selector);
        if (element && element.value) {
          username = element.value;
          break;
        } else if (element && element.textContent) {
          username = element.textContent.trim();
          break;
        }
      }
    } catch (e) {
      console.error('获取用户名失败:', e);
    }
    
    // 发送登录状态到主进程
    const message = {
      type: 'login-status',
      data: {
        isLoggedIn,
        isLoginPage,
        platform,
        url: currentUrl,
        indicator: loginIndicator,
        username,
        timestamp: new Date().toISOString()
      }
    };
    
    console.log('登录状态检查:', message.data);
    
    // 通过ipcRenderer直接发送消息
    try {
      ipcRenderer.send('message', message);
    } catch (e) {
      console.error('通过ipcRenderer发送消息失败:', e);
    }
    
    // 通过contextBridge发送消息
    try {
      if (window.electronAPI && window.electronAPI.sendToMain) {
        window.electronAPI.sendToMain('message', message);
      }
    } catch (e) {
      console.error('通过contextBridge发送消息失败:', e);
    }
    
    // 使用accountBrowser API更新状态
    try {
      if (window.accountBrowser && window.accountBrowser.updateLoginStatus) {
        window.accountBrowser.updateLoginStatus(
          isLoggedIn ? 'online' : 'offline',
          username,
          platform
        );
      }
    } catch (e) {
      console.error('通过accountBrowser API更新状态失败:', e);
    }
    
    // 如果在登录页面检测到自动登录脚本尚未执行，尝试执行
    if (isLoginPage && window.autoLogin && !window.autoLoginExecuted) {
      console.log('检测到登录页面，尝试执行自动登录脚本');
      try {
        window.autoLogin();
      } catch (e) {
        console.error('执行自动登录脚本失败:', e);
      }
    }
  } catch (e) {
    console.error('检查登录状态出错:', e);
  }
}

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', () => {
  console.log('页面加载完成，初始化登录状态检查');
  
  // 立即执行一次登录状态检查
  setTimeout(checkLoginStatus, 1000);
  
  // 定期检查登录状态（每10秒）
  setInterval(checkLoginStatus, 10000);
  
  // 在页面可见性变化时检查登录状态
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      console.log('页面变为可见，检查登录状态');
      checkLoginStatus();
    }
  });
  
  // 在用户点击操作后检查登录状态
  document.addEventListener('click', () => {
    setTimeout(checkLoginStatus, 2000); // 点击2秒后检查
  });
  
  // 监听URL变化（通过监听hashchange和popstate事件）
  window.addEventListener('hashchange', () => {
    console.log('URL hash变化，检查登录状态');
    setTimeout(checkLoginStatus, 1000);
  });
  
  window.addEventListener('popstate', () => {
    console.log('URL状态变化，检查登录状态');
    setTimeout(checkLoginStatus, 1000);
  });
}); 