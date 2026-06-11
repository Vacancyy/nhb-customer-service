#!/bin/bash
# 测试环境特药数据导入脚本 - 一键执行

echo "========================================"
echo "测试环境特药数据导入脚本"
echo "========================================"
echo ""

# 检查当前环境
echo "检查环境配置..."
if [ "$APP_ENV" != "stage" ]; then
    echo "错误：请设置 APP_ENV=stage"
    echo "使用方法: APP_ENV=stage bash import-drugs-stage.sh"
    exit 1
fi

# 检查数据库连接
echo "数据库配置:"
echo "  PG_HOST: $PG_HOST"
echo "  PG_PORT: $PG_PORT"
echo "  PG_DATABASE: $PG_DATABASE"

if [ "$PG_HOST" != "172.29.4.125" ]; then
    echo "错误：当前不是测试环境数据库"
    exit 1
fi

echo ""
echo "✅ 确认连接测试环境数据库"
echo ""

# 执行导入脚本
echo "开始导入特药数据..."
echo ""

echo "第1步：创建特药知识条目..."
npx tsx scripts/create-drug-entries.ts

echo ""
echo "第2步：补充缺失期数的答案..."
npx tsx scripts/fix-all-drugs-answers.ts

echo ""
echo "第3步：验证导入结果..."
npx tsx scripts/check-drugs-coverage.ts

echo ""
echo "========================================"
echo "导入完成！"
echo "========================================"