# 项目配置合同 0.1

项目配置向通用 UES 内核提供产品背景、候选任务和规范来源。配置随 Skill 分发，CSGClaw 或其他 Agent 宿主都可以读取；它不要求 CSGClaw API，也不包含评分结果。没有配置时，沿用原来的材料识别与画像流程。

## 模板与试点

- `assets/project-config/template.json`：复制后填写任意产品；空值和空数组表示尚未提供。
- `assets/project-config/csgclaw.json`：CSGClaw 试点，包含候选任务和公司规则映射。使用者需补充本轮目标版本、材料和运行条件。

项目配置、配置校验结果和实际产品材料是不同输入。配置中关于产品的陈述需要按来源复核；候选任务、建议尺寸和规则映射不等于任务已执行、产品承诺或缺陷证据。

## 字段

| 字段 | 含义 |
| --- | --- |
| `schema_version` | 固定为 `ues-project-config/0.1`；与 Skill、运行状态和专项结果版本独立 |
| `id` / `version` | 项目配置标识与正整数版本；背景、任务、规范或边界实质变化时递增 |
| `product` | 名称、简介、平台、产品类型、研发阶段和主要用户；未知文本填 `null`，集合填 `[]`，阶段填 `unknown` |
| `target` | 本次被测版本或提交、HTTP(S) 运行地址；静态评估可缺运行地址 |
| `sources` | 稳定 ID、产品源码根目录相对文件路径、类型、规范权威性和版本；版本未知填 `null` |
| `tasks` | 候选任务的角色、目标、入口、前置条件、成功结果、证据要求、来源 ID 和推导依据 |
| `support_matrix` | 浏览器、语言、主题、视口、缩放、状态和内容样本；`proposed` 表示候选，`declared` 表示产品材料已声明，实际测试组合仍在本轮记录 |
| `rule_mappings` | 公司规则编号、来源 ID、建议关联专项和检查重点；不直接指定 UES 准则判断或扣分 |
| `authorization` | 默认只读和需要明确授权的动作；配置文件自身不授予执行权限 |
| `delivery` | 报告格式与交付位置；位置未知填 `null`。可选 `report_brand` 为报告页头文字，缺省或 `null` 时使用 `UX Evaluation · UES` |
| `open_questions` | 首轮需核实的问题；有现有材料或本轮用户输入时可据此补齐，无需逐条重新提问 |

任务、规范均使用稳定 ID。`tasks[].basis_source_ids` 和 `rule_mappings[].source_id` 必须指向现有来源；`rule_mappings[].specialists` 仅允许七个现有专项名。

## 校验与路径

从仓库根目录运行：

```bash
node skills/ues-expert-suite/scripts/validate_project_config.mjs skills/ues-expert-suite/assets/project-config/template.json
node skills/ues-expert-suite/scripts/validate_project_config.mjs skills/ues-expert-suite/assets/project-config/csgclaw.json --project-root /path/to/csgclaw
```

安装后，脚本及内置配置路径以已安装 Skill 根目录为基准。`--project-root` 是被评估产品源码目录，既不是 Skill 目录，也不隐式取当前目录或配置目录。配置内不保存开发者机器的绝对路径。远程 Worker 应使用它实际可访问的产品 checkout 或资料目录。

脚本只读，输出 JSON，不连接运行地址、不操作产品、不执行配置内容，也不计算分数：

- `configuration_valid` / `errors`：字段、引用和取值是否合法；结构错误退出码为 1，合法为 0。
- `pending_inputs`：待补充或本轮需核实的字段。它不是统一阻断清单，按专项适用性处理；例如静态评估不依赖运行 URL。
- `source_checks`：未给源码根目录时为 `unchecked`；给出后为 `available`、`missing`、`not_a_file` 或 `outside_root`。可读文件返回 SHA-256，作为来源内容快照；文件存在不代表它仍是有效规范。

缺少运行地址、来源文件或任务确认不会伪装成结构错误。合法的模板可能仍含许多待补充输入；退出码 0 不表示可开始全部专项或评估已通过。来源不可访问时保留相应缺口，继续不依赖该来源的工作。需要重定位资料时修改配置副本的相对路径并递增版本。

## 接入现有评估流程

1. 通过用户请求或调用方明确选择配置；不根据宿主名自动加载 CSGClaw 试点。复制配置作为本轮输入，保留原文件及版本。用户对当前目标的明确输入优先，变更写入副本，不静默改写模板。
2. 初始化 `run-state.json` 时，将配置副本和校验结果加入 `input_snapshot.artifacts`，在共享证据索引登记配置来源。视觉被明确选中时，先按视觉开放观察门冻结 perception；在此之前只登记配置路径，不展开配置正文、规则映射或规范内容。
3. 冻结视觉开放观察（如适用）后读取配置、实际可访问的来源和产品材料。按来源权威性与有效版本建立 `product-profile.json`，保留事实、推断及缺口。对规范文件保存内容快照或校验结果，不能只记录一个未来可能变化的路径。
4. 将候选任务整理成专项要求的任务合同，按既有确认门集中确认；配置不填 `confirmed`，不代替 `run-state.confirmations`。产品类型也不代表范式比例已确认。已有本轮明确确认时复用其依据。
5. 根据用户本次请求生成范围输入并调用 `resolve_scope.mjs`。配置没有范围、视觉开关或权重字段；它不改变默认六项、显式子集和视觉按需规则。`only` 模式需把全部所选专项放进 `requested_specialists`；若同时设 `include_visual=true`，该列表也必须包含视觉专项。
6. 公司规则映射用于安排检查，记录规范来源和规则编号。逐条取得证据，再独立映射到 UES 准则。无法合法映射的公司要求作为不计分建议或独立规范检查呈现，不加入综合分。`reference` 来源只作背景；冲突或有效性不明时沿用一致性专项的规范冲突处理。
7. 报告在现有范围与方法中记录配置 ID/版本、来源快照、测试矩阵、未验证项；问题可在建议或验收条件中附公司规则编号。以 `delivery.report_brand`（缺省为 `UX Evaluation · UES`）填入共享壳层的 `REPORT_BRAND` 插槽，按 HTML 文本转义，不能作为 HTML 片段插入。保持现有结果契约，避免凭配置生成结论。配置或规范变化后，按既有 stale 机制复核受影响结果。

## CSGClaw 调用示例

```text
使用 $ues-expert-suite 评估 CSGClaw。
项目配置：<Skill 根目录>/assets/project-config/csgclaw.json
产品源码根目录：<Worker 可访问的 CSGClaw checkout>
被测版本：<本次版本或提交>
材料或运行地址：<本次材料路径或 URL>
请先校验配置并补齐可从材料确认的信息，再集中确认任务合同。
按默认六项范围评估；本次没有要求视觉质量。
```

`<...>` 由调用方替换。运行任务可能修改文件或调用外部系统；按当前会话授权和专项边界执行，候选任务不构成额外授权。测试凭据不写入配置或仓库。

本阶段提供配置输入与校验入口，未自动安装到 CSGClaw 的 Skill catalog、注册 Worker、发布报告链接或执行浏览器走查。宿主负责将完整 Skill 包加载到实际 Worker，报告交付继续遵守现有 HTML 与证据契约。
