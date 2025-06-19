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
  }
});

// 监听DOM加载完成
window.addEventListener('DOMContentLoaded', () => {
  console.log('账号浏览器窗口已加载');
}); 