const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('开始Windows打包...');

try {
  // 确保dist目录存在
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist', { recursive: true });
  }
  
  // 使用electron-packager进行打包
  execSync('npx electron-packager . WaimaiAccountManager --platform=win32 --arch=x64 --out=dist --overwrite --asar', { 
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/'
    }
  });
  
  console.log('打包完成！');
  
  // 列出输出文件
  if (fs.existsSync('dist')) {
    console.log('输出目录内容:');
    const files = fs.readdirSync('dist');
    console.log(files);
    
    // 查找应用程序目录
    const appDir = files.find(f => fs.statSync(path.join('dist', f)).isDirectory());
    if (appDir) {
      console.log(`应用程序目录: ${appDir}`);
      
      // 创建启动批处理文件
      const batchContent = `@echo off\r\nstart "" "%~dp0${appDir}\\WaimaiAccountManager.exe"\r\n`;
      fs.writeFileSync('dist/启动_外卖账号管理器.bat', batchContent);
      
      try {
        // 创建便携版ZIP包
        console.log('创建便携版ZIP包...');
        const zipPath = path.join('dist', 'WaimaiAccountManager-portable-win-x64.zip');
        execSync(`powershell Compress-Archive -Path "${path.join('dist', appDir, '*')}" -DestinationPath "${zipPath}" -Force`, { stdio: 'inherit' });
        console.log(`创建便携版包: ${zipPath}`);
      } catch (zipError) {
        console.log('创建ZIP失败，这可能需要手动完成:', zipError.message);
      }
    }
  }
} catch (error) {
  console.error('打包失败:', error);
  process.exit(1);
} 