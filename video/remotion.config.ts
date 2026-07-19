import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(90);
Config.setConcurrency(3);
Config.setChromiumDisableWebSecurity(true);
Config.setDelayRenderTimeoutInMilliseconds(120000);
