export function formatDate(dateString: string) {
    // 检查输入是否为空
    if (!dateString) return "";
    
    // 解析 "20250809131843" 格式的日期字符串
    // 格式: YYYYMMDDHHmmss
    const year = dateString.substring(0, 4);
    const month = dateString.substring(4, 6);
    const day = dateString.substring(6, 8);
    const hour = dateString.substring(8, 10);
    const minute = dateString.substring(10, 12);
    const second = dateString.substring(12, 14);
    
    // 返回格式化后的日期时间
    return `${year}年${month}月${day}日 ${hour}:${minute}:${second}`;
}

export function formatDateShort(dateString: string) {
    // 检查输入是否为空
    if (!dateString) return "";
    
    // 解析 "20250809131843" 格式的日期字符串
    const year = dateString.substring(0, 4);
    const month = dateString.substring(4, 6);
    const day = dateString.substring(6, 8);
    
    return `${year}年${month}月${day}日`;
}