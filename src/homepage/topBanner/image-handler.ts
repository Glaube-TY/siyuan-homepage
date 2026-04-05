
// 重置横幅图片位置
export function resetBannerPosition(bannerImage: HTMLImageElement) {
    return () => {
        bannerImage.style.transform = 'translateY(0)';
    };
}