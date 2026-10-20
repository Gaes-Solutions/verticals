export declare const MOBILE_BUSINESS_API: {
  readonly staging: "https://verticals-staging.up.railway.app/api";
  readonly production: "https://app.angaes.com/api";
};

export type MobileBusinessVariant = keyof typeof MOBILE_BUSINESS_API;

export declare function mobileBusinessBuildConfig(
  requested: string | undefined,
  apiOverride?: string,
): {
  readonly variant: MobileBusinessVariant;
  readonly apiUrl: (typeof MOBILE_BUSINESS_API)[MobileBusinessVariant];
  readonly name: string;
  readonly scheme: string;
  readonly package: string;
};
