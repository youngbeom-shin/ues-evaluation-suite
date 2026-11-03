# UES Evaluation Suite

UES 专家套件把网页、截图、设计稿、Demo 或产品材料转成有范围、有证据、可复核的体验评估。本 fork 面向 CSGClaw 及其他 Agent 宿主提供通用 UX 评估能力，以 CSGClaw 为首个项目配置试点。当前工作树版本为 `v0.8.3`，基于上游 UES v0.8.0，保留原准则与评分口径。来源、历史素材与许可记录见 [UPSTREAM.md](UPSTREAM.md)，改造记录见 [CHANGELOG.md](CHANGELOG.md)。

## 安装

### Codex

把下面这句话发送给 Codex，安装本 fork：

```text
请安装这个 Skill：https://github.com/youngbeom-shin/ues-evaluation-suite/tree/main/skills/ues-expert-suite
```

安装完成后，用 `$ues-expert-suite` 调用；如果当前对话尚未发现该 Skill，请在下一轮或新对话中使用。安装目录通常为 `~/.codex/skills/ues-expert-suite`，也可以通过 `CODEX_HOME` 指定 Codex 数据根目录。同名 Skill 已存在时先核对其来源与本地修改，再选择更新方式。

如果需要手动安装，也可以克隆本仓库，然后把 `skills/ues-expert-suite` 目录复制到本机 Codex Skills 目录。

GitHub 安装读取远程分支内容；工作树中的改动只有提交并推送后才会进入该安装入口。固定版本部署时使用已发布的 tag 或明确提交，不把本地版本号当成远程已发布版本。

### CSGClaw

使用完整的 `skills/ues-expert-suite/` 目录，保留 `SKILL.md`、`modules/`、`scripts/`、`references/` 和 `assets/`。可通过 CSGClaw 的 Skill ZIP 上传入口导入本地 catalog，再在目标 Worker 的 **Profile → Skills → Local** 中添加。ZIP 应包含顶层 `ues-expert-suite/` 目录，例如从仓库的 `skills/` 目录执行：

```bash
python3 -m zipfile -c /tmp/ues-expert-suite.zip ues-expert-suite
```

`/tmp/` 是 macOS/Linux 示例；其他系统改用可写临时目录。catalog 的位置由 CSGClaw 配置决定，默认通常为 `~/.csgclaw/skills`。导入不会自动安装运行依赖，Worker 还需具备 Node.js、Python 和所选专项需要的浏览器或资料访问能力。该仓库不自动创建 Worker，也不假设 CSGClaw 能直接从任意 GitHub URL 安装。

### 本地开发

直接修改本仓库并运行下方校验，不必先覆盖已安装 Skill。已安装目录、CSGClaw catalog 和 Worker 副本各自独立，验证后再按目标宿主的加载流程更新；不要修改已生成副本后遗漏源码。

## 快速试用

1. 安装 Skill。
2. 在新对话中提供待评估网页、截图、设计稿或 Demo。
3. 输入：`请调用 $ues-expert-suite 完成体验评估。`
4. 如需团队练习，使用 [UX 评估 Workshop](docs/workshop/ues-assis-workshop.md) 和 [问题记录模板](docs/workshop/issue-record-template.md)。

## 项目配置与 CSGClaw 试点

复制 [通用配置模板](skills/ues-expert-suite/assets/project-config/template.json)，填写产品、用户、候选任务、规范来源和运行边界；[CSGClaw 试点配置](skills/ues-expert-suite/assets/project-config/csgclaw.json) 已整理产品背景、三条候选任务、规范引用和七条公司规则映射。运行地址、被测版本和本次测试范围仍需补充。

```bash
node skills/ues-expert-suite/scripts/validate_project_config.mjs skills/ues-expert-suite/assets/project-config/template.json
node skills/ues-expert-suite/scripts/validate_project_config.mjs skills/ues-expert-suite/assets/project-config/csgclaw.json --project-root /path/to/csgclaw
```

校验器只读，输出结构错误、待补充输入、来源可达性和内容哈希。退出码 0 表示配置结构合法；任务确认、浏览器实测和评分仍由现有评估流程完成。来源路径相对被评估产品的源码根目录，配置可随完整 Skill 包交给 CSGClaw Worker。详见 [项目配置合同与调用示例](skills/ues-expert-suite/references/project-configuration.md)。

当前阶段提供配置接入，尚未自动注册 CSGClaw Worker。已有报告可通过公司 GitLab 的专用归档分支部署到 Pages，见 [报告发布与恢复说明](docs/gitlab-pages.md)。通用网页使用简易首屏测量路径；阿里云 PCP 仅在其指标和数据合同适用时使用专用适配。

## 自动发布与报告目录

完整 Skill 现在自带 GitLab Pages 发布器。启用已授权的宿主配置后，每轮 HTML 评估校验完成都会自动发布，并返回本轮报告、全部报告目录和当前项目历史目录；发布失败保留本地结果，重复命令可恢复。

本机配置保存在 `${CODEX_HOME:-~/.codex}/ues-expert-suite/publication.json`，也可通过 `UES_PUBLICATION_CONFIG` 指定。公司部署参数模板是 `skills/ues-expert-suite/assets/publication/opencsg.json`，通用安装默认不启用公司发布目的地。Worker 需单独配置 GitLab 凭据。

- [全部报告目录](https://youngbeom.pages.opencsg.com/ues-evaluation-suite/)
- [CSGClaw 项目历史](https://youngbeom.pages.opencsg.com/ues-evaluation-suite/projects/csgclaw/)
- [Skill 自动发布合同](skills/ues-expert-suite/references/gitlab-pages-publication.md)

```bash
node skills/ues-expert-suite/scripts/publish_gitlab_pages.mjs /path/to/evaluation
node scripts/test_report_publication.mjs
node scripts/test_gitlab_pages.mjs
```

## 仓库结构

```text
.
├── README.md
├── UPSTREAM.md                  # 来源与许可记录入口
├── CHANGELOG.md                 # 本 fork 的变更记录
├── skills/
│   └── ues-expert-suite/        # 唯一 Skill 来源，可直接安装
└── docs/
    └── workshop/                # Workshop 文档与图片资源
```

`skills/ues-expert-suite/` 是仓库的安装入口和唯一版本来源。仓库不额外保存发布 ZIP，避免源码与压缩包出现版本分叉。

## 默认评估范围

未明确限定专项时，套件默认路由六项常规度量：

1. 基础检查
2. 易用性
3. 一致性
4. 任务分
5. 性能
6. 虚拟用户

视觉质量模块随 Skill 提供，但仅在用户明确要求视觉检测时启用。

## 版本与验证

- 当前工作树版本：`0.8.3`（发布状态见 CHANGELOG）
- 单体 Skill：1 个 `SKILL.md`
- 内嵌专项：7 个 `MODULE.md`
- 已通过编排、范围、HTML、视觉集成、易用性、一致性、任务评分及虚拟用户测试

从仓库根目录运行现有回归与新增项目配置测试：

```bash
node skills/ues-expert-suite/scripts/test_single_package_contracts.mjs
node skills/ues-expert-suite/scripts/test_project_config.mjs
node skills/ues-expert-suite/scripts/test_report_resources.mjs
node skills/ues-expert-suite/scripts/test_orchestration_contracts.mjs
node skills/ues-expert-suite/scripts/test_html_scope_contracts.mjs
node skills/ues-expert-suite/scripts/test_visual_quality_integration.mjs
node skills/ues-expert-suite/modules/ease-of-use-suite-47/scripts/test_scenario_impacts.mjs
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s skills/ues-expert-suite/modules/virtual-user-walkthrough/scripts -p 'test_*.py'
```
