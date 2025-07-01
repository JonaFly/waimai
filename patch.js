const fs = require('fs');
const path = require('path');

// 读取文件
const filePath = path.join(__dirname, 'src/main/account-manager.js');
let content = fs.readFileSync(filePath, 'utf-8');

// 查找 setupWindowEvents 中的 closed 事件处理部分
const regex = /win\.on\('closed', \(\) => \{[\s\S]*?if \(account && account\.activeWindow === windowId\) \{[\s\S]*?this\.saveAccounts\(\)\.catch\(err => \{[\s\S]*?\}\);[\s\S]*?\}[\s\S]*?console\.log\(`窗口 \${windowId} 已关闭，清理资源`\);/g;

// 替换为新的代码
const replacement = `win.on('closed', () => {
      console.log(\`窗口 \${windowId} 已关闭，移除消息监听器\`);
      
      // 如果账号的活动窗口是当前窗口，则清除该引用
      if (account && account.activeWindow === windowId) {
        account.activeWindow = null;
        
        // 保存账号状态
        this.saveAccounts().catch(err => {
          console.error(\`更新账号 \${account.username} 状态时出错:\`, err);
        });
        
        // 重要修改：窗口关闭后，调用refreshAccountStatus来检查cookie有效性
        // 这样如果cookie有效，账号状态会保持为在线
        console.log(\`窗口 \${windowId} 已关闭，刷新账号状态以检查cookie有效性...\`);
        setTimeout(() => {
          this.refreshAccountStatus().catch(err => {
            console.error(\`刷新账号状态时出错:\`, err);
          });
        }, 100); // 延迟100毫秒，确保窗口完全关闭
      }
      
      console.log(\`窗口 \${windowId} 已关闭，清理资源\`);`;

content = content.replace(regex, replacement);

// 写回文件
fs.writeFileSync(filePath, content);
console.log('文件已更新');
