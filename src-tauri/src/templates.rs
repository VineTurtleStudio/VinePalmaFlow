use crate::models::{Template, TemplateField, TemplateView};

fn field(id: &str, field_type: &str, label: &str) -> TemplateField {
    TemplateField {
        id: id.to_string(),
        field_type: field_type.to_string(),
        label: label.to_string(),
        required: false,
        options: None,
        default: None,
        placeholder: None,
        item_template: None,
    }
}

fn select(id: &str, label: &str, options: Vec<&str>) -> TemplateField {
    TemplateField {
        id: id.to_string(),
        field_type: "select".to_string(),
        label: label.to_string(),
        required: false,
        options: Some(options.iter().map(|s| s.to_string()).collect()),
        default: options.first().map(|s| serde_yaml::Value::String(s.to_string())),
        placeholder: None,
        item_template: None,
    }
}

fn task_list() -> TemplateField {
    TemplateField {
        id: "tasks".to_string(),
        field_type: "list".to_string(),
        label: "任务列表".to_string(),
        required: false,
        options: None,
        default: None,
        placeholder: None,
        item_template: Some(vec![
            field("name", "string", "任务名称"),
            field("assignee", "string", "负责人"),
            select("status", "状态", vec!["待办", "进行中", "已完成"]),
            field("points", "number", "故事点"),
            field("deadline", "date", "截止日期"),
        ]),
    }
}

fn standard_views(name: &str) -> Vec<TemplateView> {
    vec![
        TemplateView {
            name: format!("{name} · 看板"),
            view_type: "kanban".to_string(),
            group_by: Some("tasks.status".to_string()),
            sort_by: None,
        },
        TemplateView {
            name: format!("{name} · 列表"),
            view_type: "list".to_string(),
            group_by: None,
            sort_by: Some("tasks.points".to_string()),
        },
    ]
}

fn preset(name: &str, format: &str, columns: Vec<&str>) -> crate::models::ExportPreset {
    crate::models::ExportPreset {
        name: name.to_string(),
        format: format.to_string(),
        columns: columns.into_iter().map(|s| s.to_string()).collect(),
        template: None,
    }
}

pub fn builtin_templates() -> Vec<Template> {
    vec![
        Template {
            template_id: "blank".to_string(),
            name: "空白项目".to_string(),
            description: "无预设结构，自由填写任意内容。".to_string(),
            icon: "📄".to_string(),
            mode: "both".to_string(),
            fields_order: vec![
                "name".into(), "owner".into(), "deadline".into(), "status".into(),
                "priority".into(), "progress".into(), "tags".into(), "description".into(),
            ],
            fields: vec![
                field("name", "string", "项目名称"),
                field("owner", "string", "负责人"),
                field("deadline", "date", "截止日期"),
                select("status", "状态", vec!["待办", "进行中", "已完成", "已归档"]),
                select("priority", "优先级", vec!["P0", "P1", "P2", "P3"]),
                field("progress", "number", "进度"),
                field("tags", "tags", "标签"),
                field("description", "textarea", "描述"),
            ],
            views: vec![
                TemplateView {
                    name: "卡片视图".to_string(),
                    view_type: "card".to_string(),
                    group_by: None,
                    sort_by: None,
                },
                TemplateView {
                    name: "列表视图".to_string(),
                    view_type: "list".to_string(),
                    group_by: None,
                    sort_by: None,
                },
            ],
            export_presets: vec![
                preset("项目快照 (Markdown)", "md", vec![]),
                preset("项目数据 (JSON)", "json", vec![]),
            ],
        },
        Template {
            template_id: "okr".to_string(),
            name: "个人 OKR 追踪".to_string(),
            description: "围绕目标(Objective)与关键结果(Key Result)追踪个人季度计划。".to_string(),
            icon: "🎯".to_string(),
            mode: "standard".to_string(),
            fields_order: vec![
                "name".into(), "owner".into(), "period".into(), "objectives".into(),
            ],
            fields: vec![
                field("name", "string", "周期名称"),
                field("owner", "string", "负责人"),
                field("period", "string", "周期"),
                TemplateField {
                    id: "objectives".to_string(),
                    field_type: "list".to_string(),
                    label: "目标列表".to_string(),
                    required: false,
                    options: None,
                    default: None,
                    placeholder: None,
                    item_template: Some(vec![
                        field("objective", "textarea", "目标 Objective"),
                        field("key_result", "string", "关键结果 Key Result"),
                        field("score", "number", "达成度(0-100)"),
                    ]),
                },
            ],
            views: vec![TemplateView {
                name: "卡片视图".to_string(),
                view_type: "card".to_string(),
                group_by: None,
                sort_by: None,
            }],
            export_presets: vec![
                preset("OKR 清单 (Excel)", "xlsx", vec!["objectives.objective", "objectives.key_result", "objectives.score"]),
                preset("季度回顾 (Markdown)", "md", vec![]),
            ],
        },
        Template {
            template_id: "agile-sprint".to_string(),
            name: "敏捷迭代看板".to_string(),
            description: "适用于 2 周为一个 Sprint 的敏捷开发团队。".to_string(),
            icon: "🏃".to_string(),
            mode: "standard".to_string(),
            fields_order: vec![
                "name".into(), "sprint_name".into(), "sprint_goal".into(),
                "story_points".into(), "status".into(), "tasks".into(),
            ],
            fields: vec![
                field("name", "string", "项目名称"),
                field("sprint_name", "string", "Sprint 名称"),
                field("sprint_goal", "textarea", "Sprint 目标"),
                field("story_points", "number", "总故事点"),
                select("status", "状态", vec!["规划中", "进行中", "评审中", "已完成"]),
                task_list(),
            ],
            views: standard_views("Sprint 看板"),
            export_presets: vec![
                preset("Sprint 周报 (Excel)", "xlsx", vec!["tasks.assignee", "tasks.status", "tasks.points", "tasks.deadline"]),
                preset("Sprint 任务表 (CSV)", "csv", vec!["tasks.name", "tasks.assignee", "tasks.points", "tasks.status"]),
                preset("Sprint 完整导出 (Markdown)", "md", vec![]),
            ],
        },
        Template {
            template_id: "content-calendar".to_string(),
            name: "内容发布排期".to_string(),
            description: "规划公众号、视频、图文等内容的生产与发布时间。".to_string(),
            icon: "📅".to_string(),
            mode: "standard".to_string(),
            fields_order: vec![
                "name".into(), "owner".into(), "channel".into(), "items".into(),
            ],
            fields: vec![
                field("name", "string", "排期名称"),
                field("owner", "string", "负责人"),
                select("channel", "渠道", vec!["公众号", "视频号", "抖音", "小红书", "B站", "其他"]),
                TemplateField {
                    id: "items".to_string(),
                    field_type: "list".to_string(),
                    label: "内容条目".to_string(),
                    required: false,
                    options: None,
                    default: None,
                    placeholder: None,
                    item_template: Some(vec![
                        field("title", "string", "标题"),
                        field("publish_date", "date", "发布日期"),
                        select("status", "状态", vec!["选题", "写作中", "待发布", "已发布"]),
                    ]),
                },
            ],
            views: vec![TemplateView {
                name: "列表视图".to_string(),
                view_type: "list".to_string(),
                group_by: Some("items.status".to_string()),
                sort_by: Some("items.publish_date".to_string()),
            }],
            export_presets: vec![
                preset("发布排期表 (Excel)", "xlsx", vec!["items.publish_date", "items.status"]),
                preset("排期清单 (CSV)", "csv", vec!["items.title", "items.publish_date", "items.status"]),
            ],
        },
        Template {
            template_id: "client-funnel".to_string(),
            name: "客户跟进漏斗".to_string(),
            description: "追踪销售线索从初步接触、跟进到成交的全流程。".to_string(),
            icon: "🔻".to_string(),
            mode: "standard".to_string(),
            fields_order: vec![
                "name".into(), "owner".into(), "clients".into(),
            ],
            fields: vec![
                field("name", "string", "跟进计划名称"),
                field("owner", "string", "负责人"),
                TemplateField {
                    id: "clients".to_string(),
                    field_type: "list".to_string(),
                    label: "客户列表".to_string(),
                    required: false,
                    options: None,
                    default: None,
                    placeholder: None,
                    item_template: Some(vec![
                        field("client_name", "string", "客户名称"),
                        field("contact", "string", "联系人"),
                        field("next_action", "string", "下一步动作"),
                        field("next_date", "date", "下次跟进日期"),
                        select("stage", "阶段", vec!["初步接触", "需求确认", "方案报价", "谈判中", "已成交", "已流失"]),
                    ]),
                },
            ],
            views: vec![TemplateView {
                name: "看板视图".to_string(),
                view_type: "kanban".to_string(),
                group_by: Some("clients.stage".to_string()),
                sort_by: None,
            }],
            export_presets: vec![
                preset("客户跟进表 (Excel)", "xlsx", vec!["clients.stage", "clients.next_date", "clients.next_action"]),
                preset("客户列表 (CSV)", "csv", vec!["clients.client_name", "clients.contact", "clients.stage"]),
            ],
        },
        Template {
            template_id: "product-backlog".to_string(),
            name: "产品需求池".to_string(),
            description: "收集、评估、排期产品需求。".to_string(),
            icon: "📥".to_string(),
            mode: "standard".to_string(),
            fields_order: vec![
                "name".into(), "owner".into(), "demands".into(),
            ],
            fields: vec![
                field("name", "string", "需求池名称"),
                field("owner", "string", "负责人"),
                TemplateField {
                    id: "demands".to_string(),
                    field_type: "list".to_string(),
                    label: "需求列表".to_string(),
                    required: false,
                    options: None,
                    default: None,
                    placeholder: None,
                    item_template: Some(vec![
                        field("title", "string", "需求标题"),
                        field("requester", "string", "提出人"),
                        select("priority", "优先级", vec!["P0", "P1", "P2", "P3"]),
                        field("story_points", "number", "故事点"),
                        select("status", "状态", vec!["收集", "评估中", "已排期", "开发中", "已完成"]),
                    ]),
                },
            ],
            views: standard_views("需求看板"),
            export_presets: vec![
                preset("需求清单 (Excel)", "xlsx", vec!["demands.priority", "demands.status", "demands.story_points"]),
                preset("需求看板导出 (CSV)", "csv", vec!["demands.title", "demands.requester", "demands.priority", "demands.status"]),
            ],
        },
        Template {
            template_id: "reading-notes".to_string(),
            name: "读书笔记/知识管理".to_string(),
            description: "记录阅读进度、摘录与思考。".to_string(),
            icon: "📚".to_string(),
            mode: "standard".to_string(),
            fields_order: vec![
                "name".into(), "book".into(), "notes".into(),
            ],
            fields: vec![
                field("name", "string", "笔记名称"),
                field("book", "string", "书名"),
                TemplateField {
                    id: "notes".to_string(),
                    field_type: "list".to_string(),
                    label: "章节笔记".to_string(),
                    required: false,
                    options: None,
                    default: None,
                    placeholder: None,
                    item_template: Some(vec![
                        field("chapter", "string", "章节"),
                        field("summary", "textarea", "摘要"),
                        field("quote", "textarea", "摘录"),
                    ]),
                },
            ],
            views: vec![TemplateView {
                name: "列表视图".to_string(),
                view_type: "list".to_string(),
                group_by: None,
                sort_by: None,
            }],
            export_presets: vec![
                preset("笔记摘录 (Excel)", "xlsx", vec!["notes.chapter", "notes.summary", "notes.quote"]),
            ],
        },
        Template {
            template_id: "home-renovation".to_string(),
            name: "家庭事务/装修计划".to_string(),
            description: "管理装修、搬家等家庭项目的任务与预算。".to_string(),
            icon: "🏠".to_string(),
            mode: "standard".to_string(),
            fields_order: vec![
                "name".into(), "budget".into(), "tasks".into(),
            ],
            fields: vec![
                field("name", "string", "计划名称"),
                field("budget", "number", "预算(元)"),
                task_list(),
            ],
            views: vec![TemplateView {
                name: "看板视图".to_string(),
                view_type: "kanban".to_string(),
                group_by: Some("tasks.status".to_string()),
                sort_by: None,
            }],
            export_presets: vec![
                preset("施工任务表 (Excel)", "xlsx", vec!["tasks.assignee", "tasks.status", "tasks.deadline"]),
                preset("预算明细 (CSV)", "csv", vec!["tasks.name", "tasks.points", "tasks.status"]),
            ],
        },
    ]
}

pub fn get_template(template_id: &str) -> Option<Template> {
    builtin_templates().into_iter().find(|t| t.template_id == template_id)
}

pub fn get_template_details(template_id: &str) -> Option<(String, String)> {
    builtin_templates()
        .into_iter()
        .find(|t| t.template_id == template_id)
        .map(|t| (t.template_id.clone(), t.name.clone()))
}

pub fn find_template_id(name: &str) -> Option<String> {
    builtin_templates()
        .into_iter()
        .find(|t| t.name == name || t.template_id == name)
        .map(|t| t.template_id)
}

pub fn load_custom_templates(ws: &std::path::Path) -> Vec<Template> {
    let dir = ws.join(".localflow").join("templates");
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let manifest_path = path.join("manifest.yaml");
        let fields_path = path.join("fields.yaml");
        let Ok(manifest_s) = std::fs::read_to_string(&manifest_path) else {
            continue;
        };
        let Ok(manifest): Result<serde_yaml::Value, _> = serde_yaml::from_str(&manifest_s) else {
            continue;
        };
        let Some(template_id) = manifest.get("template_id").and_then(|v| v.as_str()) else {
            continue;
        };
        if builtin_templates().iter().any(|t| t.template_id == template_id) {
            continue;
        }
        let Ok(fields_s) = std::fs::read_to_string(&fields_path) else {
            continue;
        };
        let Ok(fields): Result<Vec<TemplateField>, _> = serde_yaml::from_str(&fields_s) else {
            continue;
        };
        let export_presets = std::fs::read_to_string(path.join("export-presets.yaml"))
            .ok()
            .and_then(|s| serde_yaml::from_str::<Vec<crate::models::ExportPreset>>(&s).ok())
            .unwrap_or_default();
        out.push(Template {
            template_id: template_id.to_string(),
            name: manifest.get("name").and_then(|v| v.as_str()).unwrap_or(template_id).to_string(),
            description: manifest.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            icon: manifest.get("icon").and_then(|v| v.as_str()).unwrap_or("📋").to_string(),
            mode: manifest.get("mode").and_then(|v| v.as_str()).unwrap_or("standard").to_string(),
            fields_order: fields.iter().map(|f| f.id.clone()).collect(),
            views: vec![crate::models::TemplateView {
                name: "卡片视图".to_string(),
                view_type: "card".to_string(),
                group_by: None,
                sort_by: None,
            }],
            fields,
            export_presets,
        });
    }
    out
}
