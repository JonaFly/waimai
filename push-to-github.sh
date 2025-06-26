#!/bin/bash

# 外卖账号管理系统 - GitHub推送脚本
# 此脚本帮助将最新更改推送到GitHub并触发自动构建

# 颜色设置
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 显示帮助信息
show_help() {
  echo -e "${YELLOW}外卖账号管理系统 - GitHub推送脚本${NC}"
  echo "用法: $0 [选项]"
  echo ""
  echo "选项:"
  echo "  -m, --message    提交信息 (默认: 'Update application with latest features')"
  echo "  -t, --tag        创建新的版本标签 (例如: v1.1.0)"
  echo "  -h, --help       显示此帮助信息"
  echo ""
  echo "示例:"
  echo "  $0 -m '修复登录脚本' -t v1.1.0"
}

# 默认值
COMMIT_MESSAGE="Update application with latest features"
TAG=""

# 解析命令行参数
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -m|--message)
      COMMIT_MESSAGE="$2"
      shift
      shift
      ;;
    -t|--tag)
      TAG="$2"
      shift
      shift
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      echo -e "${RED}未知选项: $1${NC}"
      show_help
      exit 1
      ;;
  esac
done

# 确认操作
echo -e "${YELLOW}准备推送到GitHub${NC}"
echo -e "提交信息: ${GREEN}${COMMIT_MESSAGE}${NC}"
if [ -n "$TAG" ]; then
  echo -e "版本标签: ${GREEN}${TAG}${NC}"
fi

read -p "是否继续? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${RED}操作已取消${NC}"
  exit 1
fi

# 执行Git操作
echo -e "${YELLOW}添加所有更改...${NC}"
git add .

echo -e "${YELLOW}提交更改...${NC}"
git commit -m "$COMMIT_MESSAGE"

echo -e "${YELLOW}推送到远程仓库...${NC}"
git push origin

# 如果指定了标签，则创建并推送标签
if [ -n "$TAG" ]; then
  echo -e "${YELLOW}创建标签 ${TAG}...${NC}"
  git tag -a "$TAG" -m "Release $TAG"
  
  echo -e "${YELLOW}推送标签...${NC}"
  git push origin "$TAG"
  
  echo -e "${GREEN}标签 ${TAG} 已创建并推送${NC}"
  echo -e "${YELLOW}GitHub Actions将自动构建并创建新的发布版本${NC}"
else
  echo -e "${GREEN}更改已推送到GitHub${NC}"
  echo -e "${YELLOW}如需触发发布构建，请使用 -t 参数添加版本标签${NC}"
fi

echo -e "${GREEN}完成!${NC}" 