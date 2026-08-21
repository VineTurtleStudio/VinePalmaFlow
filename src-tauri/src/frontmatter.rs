use crate::models::ProjectMeta;
use crate::Error;
use serde_yaml::{Mapping, Value};

pub fn parse_front_matter(content: &str) -> Result<(ProjectMeta, String), Error> {
    let trimmed = content.trim_start_matches('\u{feff}');
    if let Some(rest) = trimmed.strip_prefix("---") {
        if let Some(end) = rest.find("\n---") {
            let yaml = &rest[..end];
            let body = rest[end + 4..].trim_start_matches('\n').trim_start().to_string();
            let value: Value = serde_yaml::from_str(yaml)
                .map_err(|e| Error::Parse(format!("YAML Front Matter 解析失败: {e}")))?;
            let meta = serde_yaml::from_value(value)
                .map_err(|e| Error::Parse(format!("Front Matter 字段不合法: {e}")))?;
            Ok((meta, body))
        } else {
            Err(Error::Parse("Front Matter 缺少结束分隔符 ---".into()))
        }
    } else {
        Err(Error::Parse("文件缺少 YAML Front Matter".into()))
    }
}

pub fn build_front_matter(meta: &ProjectMeta) -> Result<String, Error> {
    let value = serde_yaml::to_value(meta)
        .map_err(|e| Error::Parse(format!("序列化 Front Matter 失败: {e}")))?;
    let map = value
        .as_mapping()
        .ok_or_else(|| Error::Parse("Front Matter 应为映射".into()))?;

    let mut ordered = Mapping::new();
    let order = [
        "id",
        "name",
        "status",
        "created_at",
        "updated_at",
        "version",
        "template_id",
        "owner",
        "deadline",
        "priority",
        "progress",
        "tags",
        "parent_id",
        "sync_devices",
        "custom_fields",
    ];
    for key in order {
        if let Some(v) = map.get(Value::String(key.to_string())) {
            if !is_empty_value(v) {
                ordered.insert(Value::String(key.to_string()), v.clone());
            }
        }
    }
    for (k, v) in map {
        let key_str = k.as_str().unwrap_or("").to_string();
        if !order.contains(&key_str.as_str()) && !is_empty_value(v) {
            ordered.insert(k.clone(), v.clone());
        }
    }

    let yaml = serde_yaml::to_string(&Value::Mapping(ordered))
        .map_err(|e| Error::Parse(format!("序列化 YAML 失败: {e}")))?;
    Ok(format!("---\n{yaml}---\n"))
}

fn is_empty_value(v: &Value) -> bool {
    match v {
        Value::Null => true,
        Value::String(s) => s.is_empty(),
        Value::Sequence(seq) => seq.is_empty(),
        Value::Mapping(map) => map.is_empty(),
        _ => false,
    }
}

pub fn project_to_file_content(meta: &ProjectMeta, body: &str) -> Result<String, Error> {
    let fm = build_front_matter(meta)?;
    let heading = format!("# {}\n\n", meta.name);
    Ok(format!("{fm}{heading}{body}"))
}
