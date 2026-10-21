import withSerwistInit from "@serwist/next";
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // Reconnection must sync in place, never reload and discard an active entry.
  reloadOnOnline: false,
  additionalPrecacheEntries: [
    {
      url: "/offline",
      revision: process.env.BUILD_REVISION || String(Date.now()),
    },
  ],
});
export default withSerwist({
  allowedDevOrigins: ["192.168.1.6"],
  transpilePackages: ["@electric-sql/pglite"],
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^node:(module|fs|path|url|crypto)$/,
        }),
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        module: false,
      };
    }
    return config;
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
      {
        source: "/api/(.*)",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
});
