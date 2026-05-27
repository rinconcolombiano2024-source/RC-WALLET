module.exports = {
  webpack: {
    configure: (webpackConfig) => {

      webpackConfig.resolve.fallback = {
        fs: false,
        net: false,
        tls: false,
      };

      return webpackConfig;
    },
  },
};
