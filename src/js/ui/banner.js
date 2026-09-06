export const initBannerSpacing = (siteBanner) => {
  const bannerClearance = 72;

  const updateBannerSpace = () => {
    if (!siteBanner) {
      document.documentElement.style.setProperty("--banner-space", "0px");
      return;
    }

    const bannerHeight = siteBanner.getBoundingClientRect().height;
    const bannerTop = Number.parseFloat(getComputedStyle(siteBanner).top) || 0;

    document.documentElement.style.setProperty("--banner-space", `${bannerHeight + bannerTop + bannerClearance}px`);
  };

  if (siteBanner && "ResizeObserver" in window) {
    new ResizeObserver(updateBannerSpace).observe(siteBanner);
  }

  window.addEventListener("load", updateBannerSpace);
  window.addEventListener("resize", updateBannerSpace);
  updateBannerSpace();
};
