export const initBannerSpacing = (siteBanner) => {
  const updateBannerSpace = () => {
    if (!siteBanner) {
      document.documentElement.style.setProperty("--banner-space", "0px");
      return;
    }

    const bannerHeight = siteBanner.getBoundingClientRect().height;
    const bannerTop = Number.parseFloat(getComputedStyle(siteBanner).top) || 0;

    document.documentElement.style.setProperty("--banner-space", `${bannerHeight + bannerTop + 16}px`);
  };

  if (siteBanner && "ResizeObserver" in window) {
    new ResizeObserver(updateBannerSpace).observe(siteBanner);
  }

  window.addEventListener("load", updateBannerSpace);
  window.addEventListener("resize", updateBannerSpace);
  updateBannerSpace();
};
