/** @type {import('next').NextConfig} */
const nextConfig = {
  // node:sqlite is a builtin; keep it external so webpack never tries to bundle it.
  webpack(config) {
    config.externals = config.externals || []
    config.externals.push({ 'node:sqlite': 'commonjs node:sqlite' })
    return config
  },
}

export default nextConfig
