// 图标管理模块
// 提供应用和托盘图标的路径和回退选项

const path = require('path');
const fs = require('fs');
const { nativeImage } = require('electron');

// 图标路径配置
const iconPaths = {
  // 应用图标
  app: {
    default: path.resolve(__dirname, './default-icon.png'),
    alternatives: [
      path.resolve(__dirname, './app-icon.png'),
      path.resolve(__dirname, './icon.png'),
      path.resolve(__dirname, './icons/app.png')
    ]
  },
  
  // 托盘图标
  tray: {
    default: path.resolve(__dirname, './tray-icon.png'),
    alternatives: [
      path.resolve(__dirname, './icon.png'),
      path.resolve(__dirname, './default-icon.png'),
      path.resolve(__dirname, './icons/tray.png')
    ]
  }
};

/**
 * 获取可用的图标路径
 * @param {string} type - 图标类型 ('app' 或 'tray')
 * @returns {string} 图标路径
 */
function getIconPath(type = 'app') {
  const iconConfig = iconPaths[type] || iconPaths.app;
  
  // 检查默认图标是否存在
  if (fs.existsSync(iconConfig.default)) {
    console.log(`使用默认${type}图标: ${iconConfig.default}`);
    return iconConfig.default;
  }
  
  // 尝试替代图标
  for (const altPath of iconConfig.alternatives) {
    if (fs.existsSync(altPath)) {
      console.log(`使用替代${type}图标: ${altPath}`);
      return altPath;
    }
  }
  
  // 如果没有可用图标，返回默认路径（即使不存在）
  console.warn(`未找到任何可用的${type}图标，返回默认路径`);
  return iconConfig.default;
}

/**
 * 创建托盘图标
 * @returns {Electron.NativeImage} 托盘图标
 */
function createTrayIcon() {
  const iconPath = getIconPath('tray');
  
  try {
    if (fs.existsSync(iconPath)) {
      return nativeImage.createFromPath(iconPath);
    } else {
      console.warn(`托盘图标文件不存在: ${iconPath}，将使用空图标`);
      return nativeImage.createEmpty();
    }
  } catch (error) {
    console.error('创建托盘图标失败:', error);
    return nativeImage.createEmpty();
  }
}

/**
 * 创建应用图标
 * @returns {Electron.NativeImage} 应用图标
 */
function createAppIcon() {
  const iconPath = getIconPath('app');
  
  try {
    if (fs.existsSync(iconPath)) {
      return nativeImage.createFromPath(iconPath);
    } else {
      console.warn(`应用图标文件不存在: ${iconPath}，将使用默认图标`);
      return null; // 让Electron使用默认图标
    }
  } catch (error) {
    console.error('创建应用图标失败:', error);
    return null;
  }
}

module.exports = {
  getIconPath,
  createTrayIcon,
  createAppIcon
}; 
 