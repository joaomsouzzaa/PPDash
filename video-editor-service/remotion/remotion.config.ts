import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setConcurrency(2); // VPS tem 2 vCPU
Config.setChromiumOpenGlRenderer("angle");
