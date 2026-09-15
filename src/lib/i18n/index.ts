import type { FeedItem } from "@/lib/types";
export type Locale = "en" | "zh";
export type Translation = { locale?: Locale; sourceTitle: string; sourceSummary: string; title: string; summary: string; sourceBrief?: FeedItem["brief"]; brief?: FeedItem["brief"] };
export const briefFields = ["whatHappened", "whyItMatters", "potentialImpact", "keyTakeaway"] as const;
export type Translations = Record<string, Translation>;
export function resolveLocale(saved: string | null, browser: string): Locale {
  return saved === "en" || saved === "zh" ? saved : browser.toLowerCase().startsWith("zh") ? "zh" : "en";
}
export function localizeItem(item: FeedItem, locale: Locale, translations: Translations): FeedItem {
  const embedded = item.translations?.[locale];
  if (embedded) return { ...item, ...embedded };
  const entry = translations[item.id];
  if (!entry || (entry.locale ?? "zh") !== locale || entry.sourceTitle !== item.title || entry.sourceSummary !== item.summary) return item;
  const briefMatches = entry.sourceBrief && entry.brief && briefFields.every(field => entry.sourceBrief?.[field] === item.brief?.[field]);
  return { ...item, title: entry.title, summary: entry.summary, ...(briefMatches ? { brief: entry.brief } : {}) };
}
// Editorial topics are UI labels, translated immediately without a model call.
const topicLabels: Record<string, string> = {
  "Autonomous Mobile Robots": "自主移动机器人", "Business Resources": "商业资源",
  "Arms / Manipulators": "机械臂 / 操作器", "Actuators / Motors / Servos": "执行器 / 电机 / 伺服",
  "Humanoid-robots": "人形机器人", "Medical-robots": "医疗机器人", "Video-friday": "每周机器人视频",
  "Robotics": "机器人", "Agriculture": "农业", "Artificial Intelligence / Cognition": "人工智能 / 认知",
  "Machine Learning & Data Science": "机器学习与数据科学", "Climate change and energy": "气候变化与能源",
  "Artificial intelligence": "人工智能", "Agents": "智能体", "Agent": "智能体", "Embodied": "具身智能",
  "Trust": "可信与安全", "Eval": "评测", "Product": "产品", "Improvement": "功能改进",
  "Research Papers": "研究论文", "Model Releases": "模型发布", "AI Products": "AI 产品",
  "Industry Trends": "行业趋势", "Tools": "工具", "China": "中国", "The Download": "每日科技速览",
  "Automation": "自动化", "Autonomous Vehicles": "自动驾驶", "Autonomous vehicles": "自动驾驶",
  "Mobile Robots": "移动机器人", "Mobile-robots": "移动机器人", "Cobots": "协作机器人",
  "Drones": "无人机", "Sensors": "传感器", "Manufacturing": "制造业", "Logistics": "物流",
  "Industrial Robots": "工业机器人", "Industrial-robots": "工业机器人", "Software": "软件",
  "Hardware": "硬件", "Business": "商业", "News": "资讯", "Safety": "安全", "Security": "安全",
  "Reinforcement Learning": "强化学习", "Computer Vision": "计算机视觉", "Natural Language Processing": "自然语言处理",
  "Funding": "融资", "Startups": "初创公司", "Open Source": "开源", "Official": "官方",
  "FRICTION": "使用障碍", "UNEXPECTED_USE": "新用法",
};
export const zh: Record<string, string> = {
  "Developer Community": "开发者社区", "Foreign Media": "海外媒体", "Tech Blog": "技术博客",
  "GitHub · Articles": "GitHub · 文章", "GitHub · Skills": "GitHub · 技能", "GitHub · Projects": "GitHub · 项目",
  "Embodied AI": "具身智能", "Release": "发布", "Skill": "技能", "Discussion | Link": "讨论 | 链接",
  "AI & ML": "AI 与机器学习", "Artificial Intelligence": "人工智能", "Multimodal": "多模态",

  "Paper": "论文",
  "Facts": "事实",
  "Source": "来源",
  "What happened": "发生了什么",
  "Facts only": "仅呈现事实",
  "Why it matters": "为何值得关注",
  "Why this matters now": "当下的重要性",
  "Potential impact": "潜在影响",
  "What might change": "可能带来的变化",
  "Key takeaway": "核心要点",
  "One thing to remember": "最值得记住的一点",
  "Source-supported facts": "有来源支持的事实",
  "Not enough source evidence yet to support a full Impact Brief.": "目前的来源证据不足以支持完整的影响简报。",
  "Not enough source evidence for an Impact Brief. Read the original post.": "来源证据不足以生成影响简报，请查看原文。",
  "Sign in to sync saves across devices": "登录后跨设备同步收藏",
  "High Impact": "重大影响",
  "Trending": "热门",
  "Emerging": "新兴",
  "New Capability": "新能力",
  "Developer Signal": "开发者动态",
  "Close brief backdrop": "关闭简报",
  "Close brief": "关闭简报",
  "Move brief": "移动简报",
  "Resize brief from left": "从左侧调整简报宽度",
  "Resize brief from right": "从右侧调整简报宽度",
  "Unclear title": "标题不清楚",
  "Unclear summary": "摘要不清楚",
  "Wrong place in Feed": "排序不合适",
  "Not relevant": "内容不相关",
  "Couldn’t save the flag. Try again.": "无法保存反馈，请重试。",
  "Already flagged": "已反馈",
  "Flag this item": "反馈这条内容",
  "Flagged": "已反馈",
  "Flag": "反馈",
  "Bad case already flagged": "已反馈内容问题",
  "Flag bad case": "反馈内容问题",
  "Bad case": "内容问题",
  "Update flag": "更新反馈",
  "What’s wrong?": "有什么问题？",
  "Optional note": "补充说明（选填）",
  "Cancel": "取消",
  "Saving…": "正在保存…",
  "Update": "更新",
  "Submit": "提交",

  "Feed":"动态", "Liked":"喜欢", "Saved":"收藏", "Library":"资料库",
  "What matters in AI":"关注 AI 重要动态", "What matters in AI today":"今天值得关注的 AI 动态",
  "All":"全部", "Launches":"发布", "Research":"研究", "Other":"其他",
  "Search":"搜索", "Search…":"搜索标题、摘要或来源…", "Close":"关闭",
  "Show search and filters":"显示搜索和筛选", "Hide search and filters":"隐藏搜索和筛选",
  "Sign in":"登录", "Sign in with Google":"使用 Google 登录", "Continue with Google":"使用 Google 继续",
  "Sign out":"退出登录", "Sign in to sync":"登录以同步", "Sign in to sync your likes and saves.":"登录后同步喜欢和收藏的内容。",
  "Redirecting…":"正在跳转…", "Sign-in is currently unavailable. Please try again later.":"登录暂不可用，请稍后重试。",
  "Could not connect to Google. Please try again.":"无法连接 Google，请重试。",
  "Sign-in failed or expired. Try again.":"登录失败或已过期，请重试。",
  "Signed in. Likes and saves will sync.":"登录成功，喜欢和收藏将自动同步。", "Signed out.":"已退出登录。",
  "Sign in to like and save items.":"登录后即可喜欢和收藏内容。",
  "Your sign-in session could not be loaded. Please sign in again.":"无法加载登录状态，请重新登录。",
  "The sign-in session could not be loaded. Try again.":"无法加载登录状态，请重试。",
  "Like":"喜欢", "Unlike":"取消喜欢", "Save":"收藏", "Unsave":"取消收藏", "Remove bookmark":"取消收藏",
  "Added to Liked.":"已添加到喜欢。", "Removed from Liked.":"已取消喜欢。", "Saved.":"已收藏。", "Removed from Saved.":"已取消收藏。",
  "Couldn’t update Saved. Try again.":"无法更新收藏，请重试。", "Couldn’t update Liked. Try again.":"无法更新喜欢，请重试。",
  "Sign in to save items.":"登录后即可收藏。", "Sign in to like items.":"登录后即可喜欢内容。",
  "Feed updated.":"动态已更新。", "Feed is up to date.":"已是最新动态。",
  "Still using the last feed. Refresh is taking longer.":"刷新需要更多时间，先显示已有动态。",
  "Refresh timed out.":"刷新超时。", "Couldn’t refresh the feed.":"无法刷新动态。",
  "Refreshing…":"正在刷新…", "Pull down from the top to refresh":"在顶部下拉刷新", "Release to refresh":"松开刷新", "Pull to refresh":"下拉刷新",
  "No updates match these filters.":"没有符合筛选条件的动态。", "No updates in these sources.":"这些来源暂无动态。", "Building the live feed…":"正在加载动态…", "Loading feed":"正在加载动态",
  "Read original":"查看原文", "Show original":"显示原文", "Show translation":"显示译文", "Impact Brief":"影响简报", "Dismiss":"关闭",
  "Sign in to sync likes across devices":"登录后跨设备同步喜欢的内容", "Sign in to sync saved items":"登录后同步收藏",
  "Sign in to like items across devices.":"登录后跨设备同步喜欢的内容。", "Sign in to save items to your library.":"登录后即可收藏内容。",
  "No likes yet. Heart items in Feed to collect them here.":"暂无喜欢的内容，点击动态上的爱心即可添加。",
  "No saved items yet. Bookmark cards in Feed to collect them here.":"暂无收藏，点击动态上的收藏按钮即可添加。",
};
export function translateUI(text: string, locale: Locale): string {
  if (locale === "en") return ({ "量子位": "QbitAI", "新智元": "AI Era", "机器之心": "Synced", "资讯": "News", "研究": "Research", "技能": "Skill" } as Record<string, string>)[text] ?? text;
  if (zh[text]) return zh[text];
  const normalizeLabel = (value: string) => value.trim().toLowerCase().replace(/[-–—_]+/g, " ").replace(/\s+/g, " ");
  const labelDictionary = { ...topicLabels, ...zh };
  const label = Object.keys(labelDictionary).find(key => normalizeLabel(key) === normalizeLabel(text));
  if (label) return labelDictionary[label];
  // Source taxonomy labels often add an acronym; translate the name, retain it.
  const acronym = text.trim().match(/^(.+?)\s*\(([A-Z][A-Za-z0-9-]*)\)$/);
  if (acronym) {
    const translated = translateUI(acronym[1], locale);
    if (translated !== acronym[1]) return `${translated}（${acronym[2]}）`;
  }
  const libraryLabel = text.replace(/^(\d+) liked · synced to /, "$1 条喜欢 · 已同步至 ")
    .replace(/^(\d+) saved · synced to /, "$1 条收藏 · 已同步至 ");
  if (libraryLabel !== text) return libraryLabel;
  if (text.includes(" · ")) return text.split(" · ").map(part => translateUI(part, locale)).join(" · ");
  if (/^\d+ official sources?$/.test(text)) return text.replace(/ official sources?$/, " 个官方来源");
  if (/^\d+ evidence$/.test(text)) return text.replace(/ evidence$/, " 条证据");
  if (/^\d+d$/.test(text)) return text.replace(/d$/, " 天");
  if (text.startsWith("Flagged · ")) return `已反馈 · ${translateUI(text.slice(10), locale)}`;
  return text;
}
