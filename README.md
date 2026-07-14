# shengji-frontend

声纪前端共享组件库，是 GitHub 版和公司 GitLab 版的唯一共享前端源码。

## 目录结构
- `components/` - UI 组件
- `lib/` - 工具函数
- `types.ts` - 类型定义
- `styles.css` - 样式

## 发布与同步

不使用 git submodule 或本机符号链接。两端仓库都保存可独立构建的真实前端文件，使用同一脚本从本仓库的已提交版本同步。

```bash
node scripts/sync-frontends.mjs \
  --public /path/to/shengji-voice-recorder \
  --company /path/to/shengji-voice-recorder-company \
  --build
```

脚本会：

1. 将 `components/`、`lib/`、`styles.css`、`types.ts` 同步到两端；
2. 写入各自的 `frontend-sync.json`，记录共享提交和所有文件的 SHA-256 校验值；
3. 可选地构建两端前端。`--check` 只校验两端是否仍与当前共享版本一致。

共享目录只能在本仓库修改。同步到两端后，必须提交两端生成的真实文件与 `frontend-sync.json`；CI 可运行同一脚本的 `--check` 来阻止漂移。
