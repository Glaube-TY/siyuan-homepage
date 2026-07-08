import type { AccountingIconName } from "./accountingIconTypes";

export interface CategoryItem {
    key: string;
    label: string;
    icon: AccountingIconName;
    secondaries: string[];
}

/** 支出分类 */
export const EXPENSE_CATEGORIES: CategoryItem[] = [
    { key: "catering", label: "餐饮", icon: "utensils", secondaries: ["早餐", "午餐", "晚餐", "夜宵", "奶茶", "水果", "零食"] },
    { key: "shopping", label: "购物", icon: "shoppingBag", secondaries: ["日用品", "服饰", "数码", "家居", "美妆"] },
    { key: "daily", label: "日常", icon: "home", secondaries: ["通勤", "话费", "水电", "快递", "物业"] },
    { key: "travel", label: "旅行", icon: "plane", secondaries: ["机票", "酒店", "门票", "交通", "餐饮旅行"] },
    { key: "study", label: "学习", icon: "bookOpen", secondaries: ["书籍", "课程", "文具", "考试"] },
    { key: "housing", label: "住房", icon: "building2", secondaries: ["房租", "房贷", "装修", "维修"] },
    { key: "entertainment", label: "娱乐", icon: "gamepad2", secondaries: ["电影", "游戏", "音乐", "聚会"] },
    { key: "gift", label: "请客送礼", icon: "gift", secondaries: ["请客", "送礼", "红包", "份子钱"] },
    { key: "sports", label: "运动", icon: "dumbbell", secondaries: ["健身", "装备", "课程运动"] },
    { key: "other", label: "其它", icon: "moreHorizontal", secondaries: [] },
];

/** 收入分类 */
export const INCOME_CATEGORIES: CategoryItem[] = [
    { key: "salary", label: "工资", icon: "briefcase", secondaries: ["基本工资", "绩效", "补贴"] },
    { key: "bonus", label: "奖金", icon: "award", secondaries: ["年终奖", "项目奖", "全勤"] },
    { key: "parttime", label: "兼职", icon: "hand", secondaries: ["freelance", "稿费", "咨询"] },
    { key: "reimbursement", label: "报销", icon: "receipt", secondaries: ["差旅报销", "交通报销", "其他报销"] },
    { key: "investment", label: "投资", icon: "chartColumn", secondaries: ["基金", "股票", "理财"] },
    { key: "other", label: "其它", icon: "moreHorizontal", secondaries: [] },
];

/** 根据方向获取分类列表 */
export function getCategoriesByDirection(direction: "expense" | "income" | "transfer"): CategoryItem[] {
    if (direction === "transfer") return [];
    return direction === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

/** 根据 key 查找分类项 */
export function findCategoryByKey(direction: "expense" | "income" | "transfer", key: string): CategoryItem | undefined {
    if (direction === "transfer") return undefined;
    return getCategoriesByDirection(direction).find((cat) => cat.key === key);
}

/** 根据 label 查找分类项（用于从现有数据回填） */
export function findCategoryByLabel(direction: "expense" | "income" | "transfer", label: string): CategoryItem | undefined {
    if (direction === "transfer") return undefined;
    return getCategoriesByDirection(direction).find((cat) => cat.label === label);
}

/** 根据 categoryPrimary label 获取对应图标名（用于列表显示） */
export function getCategoryIcon(direction: string, categoryLabel: string): AccountingIconName {
    if (direction === "transfer") return "arrowRightLeft";
    const dir = (direction === "income" ? "income" : "expense") as "expense" | "income";
    const cat = findCategoryByLabel(dir, categoryLabel);
    return cat?.icon || "moreHorizontal";
}
