import { useEffect } from "react";

type BrandProjection = {
  productKey: "lyfeos";
  productOwner: "OST";
  brand: { productName: string; shortName: string; accentColor: string; supportUrl: string };
};

export default function InstallationBrandRuntime() {
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/installation/brand", { credentials: "same-origin", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((projection: BrandProjection | null) => {
        if (!projection || projection.productKey !== "lyfeos" || projection.productOwner !== "OST") return;
        document.title = `${projection.brand.productName} - Dashboard`;
        document.documentElement.dataset.installationBrand = projection.brand.shortName;
        let theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
        if (!theme) { theme = document.createElement("meta"); theme.name = "theme-color"; document.head.appendChild(theme); }
        theme.content = projection.brand.accentColor;
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return null;
}
