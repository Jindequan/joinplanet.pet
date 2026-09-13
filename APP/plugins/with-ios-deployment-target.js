/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { withPodfile } = require('@expo/config-plugins');

const IOS_DEPLOYMENT_TARGET = '15.1';

module.exports = function withIosDeploymentTarget(config) {
  return withPodfile(config, (podfileConfig) => {
    const contents = podfileConfig.modResults.contents;
    if (contents.includes("build_settings['IPHONEOS_DEPLOYMENT_TARGET']")) {
      return podfileConfig;
    }

    const marker = `    )\n  end\nend`;
    const patch = `    )\n    installer.pods_project.targets.each do |target|\n      target.build_configurations.each do |build_configuration|\n        build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${IOS_DEPLOYMENT_TARGET}'\n      end\n    end\n  end\nend`;
    if (!contents.includes(marker)) {
      throw new Error('Could not find the generated Podfile post_install block');
    }
    podfileConfig.modResults.contents = contents.replace(marker, patch);
    return podfileConfig;
  });
};
