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

// 监听DOM加载完成
window.addEventListener('DOMContentLoaded', () => {
  console.log('账号浏览器窗口已加载');
  
  // 添加消息监听器，接收来自页面的消息
  window.addEventListener('message', (event) => {
    // 验证消息来源
    if (event.data && event.data.type === 'LOGIN_STATUS') {
      console.log('接收到登录状态消息:', event.data);
      
      // 获取窗口ID并解析用户名
      const windowId = window.accountBrowser.getWindowId();
      if (windowId) {
        const parts = windowId.split('-');
        if (parts.length >= 2) {
          const username = parts[1];
          const platform = parts[0];
          
          // 向主进程发送登录状态更新
          ipcRenderer.send('login-status-update', {
            status: event.data.status,
            username: username,
            platform: platform || event.data.platform,
            timestamp: event.data.timestamp || Date.now()
          });
        }
      }
    }
  });
  
  // 定期检查页面元素判断登录状态
  setTimeout(checkLoginStatus, 3000);
});

// 检查登录状态的函数
function checkLoginStatus() {
  try {
    // 检查是否存在"全部门店"等元素
    const allStoresElement = document.querySelector('.全部门店') || 
                             document.querySelector('button:contains("全部门店")') ||
                             Array.from(document.querySelectorAll('*')).find(el => 
                               el.textContent && el.textContent.includes('全部门店')
                             );
    
    // 检查其他后台特有元素
    const otherElements = document.querySelector('.商家首页') || 
                          document.querySelector('*:contains("商家首页")') ||
                          document.querySelector('.订单管理') ||
                          document.querySelector('*:contains("订单管理")') ||
                          document.querySelector('.商品管理') ||
                          document.querySelector('*:contains("商品管理")');
    
    const isLoggedIn = !!(allStoresElement || otherElements);
    
    if (isLoggedIn) {
      console.log('检测到登录成功特征元素，用户已登录');
      
      // 获取窗口ID并解析用户名
      const windowId = window.accountBrowser.getWindowId();
      if (windowId) {
        const parts = windowId.split('-');
        if (parts.length >= 2) {
          const username = parts[1];
          const platform = parts[0];
          
          // 向主进程发送登录状态更新
          ipcRenderer.send('login-status-update', {
            status: 'success',
            username: username,
            platform: platform,
            timestamp: Date.now()
          });
        }
      }
    }
  } catch (e) {
    console.error('检查登录状态出错:', e);
  }
  
  // 每30秒检查一次
  setTimeout(checkLoginStatus, 30000);
} 