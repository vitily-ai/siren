interface ImportMetaEnv {
  readonly BUILD_METADATA?: string;
  readonly PACKAGE_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
