import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // the user guide is a static mdBook shipped in public/docs — this
      // makes the friendly /docs URL land on its index everywhere (dev
      // serves public files without directory index resolution)
      { source: "/docs", destination: "/docs/index.html", permanent: false },
    ];
  },
};

export default nextConfig;
