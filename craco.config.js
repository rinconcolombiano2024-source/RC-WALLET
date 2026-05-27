const webpack = require("webpack");

module.exports = {

  webpack: {

    configure: (webpackConfig) => {

      webpackConfig.resolve.fallback = {

        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        os: false,
        url: false,
        zlib: false,
        assert: false,
      };

      webpackConfig.plugins = [

        ...(webpackConfig.plugins || []),

        new webpack.ProvidePlugin({
          process: "process/browser",
        }),
      ];

      webpackConfig.ignoreWarnings = [

        {
          module: /node_modules/,
        },
      ];

      return webpackConfig;
    },
  },
};
