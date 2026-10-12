# Android 签名与打包

本 Fork 的 Android 正式包统一由 Gradle 签名。本地与 GitHub Actions 使用同一密钥；正式构建缺少签名配置时会失败，不会发布未签名 APK。公开证书 SHA-256 指纹保存在 `src-tauri/gen/android/release-signing.sha256`，CI 会核对每个 APK 的签名。

## 本地构建

安装 Android SDK、NDK、JDK 和 Rust Android targets 后执行：

```sh
npm ci
npm run android:build -- --target aarch64
```

脚本默认读取用户目录下的 `Documents/OpenCodeUI-signing/signing.json`。可通过 `OPENCODE_ANDROID_SIGNING_CONFIG` 指定其他位置。配置结构如下，实际密码只保存在仓库外的私密文件中：

```json
{
  "keystorePath": "/absolute/path/opencodeui-release.p12",
  "keyAlias": "opencodeui-release",
  "password": "<private password>"
}
```

CI 或其他构建环境直接提供 `ANDROID_KEYSTORE_PATH`、`ANDROID_KEY_ALIAS` 和 `ANDROID_KEY_PASSWORD` 三个环境变量即可；设置路径后，不再读取本地配置。不要将密钥、密码或配置文件提交到 Git。

## GitHub Actions

`xiufeigo/OpenCodeUI` 仓库的 Actions secrets 使用：

- `ANDROID_KEY_BASE64`：PKCS#12 密钥文件的 Base64 内容。
- `ANDROID_KEY_ALIAS`：密钥别名。
- `ANDROID_KEY_PASSWORD`：密钥库和私钥共用的密码。

现有 Release 工作流在推送 `v*` 标签时构建 arm64 和 armv7 APK，校验签名指纹后发布。修改工作流与指纹的提交必须包含在该发布标签中。

## 备份与更新安装

请离线备份整个 `OpenCodeUI-signing` 目录，尤其是 `.p12` 和 `signing.json`。GitHub secrets 无法取回明文，丢失私钥后无法继续使用相同签名发布更新。

这套新密钥与上游包、Android debug 包的签名不同。首次换装可能需要先备份设置并卸载旧包；此后本 Fork 使用同一密钥的正式包可以覆盖更新。

应用内更新检测和下载入口指向 `https://github.com/xiufeigo/OpenCodeUI/releases/latest`；仓库尚无正式 Release 时会明确显示 GitHub 的 HTTP 404。
