# SantiPX 小白部署和使用说明书

如果你是业务使用人员，不需要部署系统，请看这里：

- [SantiPX 小白使用说明书（业务用户版）](./USER_GUIDE.md)

下面内容是给服务器部署人员看的。

这份说明给第一次部署的人使用，按顺序复制命令即可。

## 1. 这个项目是什么

SantiPX 是一个品宣图片生成工具。用户从公司平台点击进入时，链接里会带手机号参数，例如：

```text
https://px.ks.santisaas.com/?phone=10000000001
```

系统会用 `phone` 区分用户。不同手机号之间的数据互相隔离，包括：

- 产品参考图
- Prompt 文案
- 宣传图节点
- API 供应商
- API Key
- 服务映射
- 图床配置
- 并发数设置

如果链接没有带 `phone`，并且浏览器本地也没有保存过手机号，页面会弹出手机号输入框。

## 2. 部署结构

这个项目用 Docker 一键运行。

容器里只有一个服务，默认端口是 `8089`：

- 前端页面由 Node 服务托管
- `/__api_proxy` 用来转发 AI API 请求，避免浏览器 CORS 问题

所以不是传统的前后端两个容器，也不需要单独启动后端。

## 3. 服务器准备

服务器需要安装：

- Git
- Docker
- Docker Compose
- Nginx

检查命令：

```bash
git --version
docker --version
docker compose version
nginx -v
```

如果命令都能正常显示版本号，就可以继续。

## 4. 第一次部署

进入你想放项目的目录，例如：

```bash
cd /data
```

拉取代码：

```bash
git clone https://github.com/XiaoZouYu/SantiPX.git
cd SantiPX
```

构建并启动：

```bash
docker compose up -d --build
```

查看是否启动成功：

```bash
docker compose ps
docker compose logs -f santipx
```

如果看到类似下面的日志，说明服务启动成功：

```text
SantiPX server listening on http://0.0.0.0:8089
```

本机测试：

```bash
curl http://127.0.0.1:8089/healthz
```

正常会返回：

```json
{"ok":true}
```

## 5. Nginx 配置

新建或编辑 Nginx 配置文件，例如：

```bash
vim /etc/nginx/conf.d/santipx.conf
```

写入下面内容：

```nginx
server {
    listen 80;
    server_name px.ks.santisaas.com;

    client_max_body_size 500m;

    location / {
        proxy_pass http://127.0.0.1:8089;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;

        proxy_buffering off;
        proxy_request_buffering off;
    }
}
```

检查 Nginx 配置是否正确：

```bash
nginx -t
```

如果显示 `successful`，重新加载 Nginx：

```bash
systemctl reload nginx
```

访问：

```text
http://px.ks.santisaas.com/?phone=10000000001
```

## 6. HTTPS 配置

如果公司已经有统一 HTTPS 网关，让网关转发到这台机器即可。

如果要在本机 Nginx 上配置 HTTPS，可以用公司已有证书，或者让运维配置证书。HTTPS 配好后访问地址变成：

```text
https://px.ks.santisaas.com/?phone=10000000001
```

## 7. 日常更新项目

以后代码有更新时，在服务器项目目录执行：

```bash
cd /data/SantiPX
git pull
docker compose up -d --build --force-recreate
```

查看日志：

```bash
docker compose logs -f santipx
```

## 8. 常用命令

查看容器状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f santipx
```

停止服务：

```bash
docker compose down
```

重新启动：

```bash
docker compose up -d
```

重新构建并启动：

```bash
docker compose up -d --build --force-recreate
```

## 9. API 供应商配置说明

每个手机号都需要自己配置 API 供应商。

例如：

- 用户 A：`?phone=10000000001`
- 用户 B：`?phone=10000000002`

这两个用户看到的 API 供应商配置是不一样的，不会互相混用。

如果某个用户页面提示“部分服务未配置”，说明这个手机号下还没有配置完整：

1. 点击左侧或底部的设置按钮
2. 添加 API 供应商
3. 填写 API Key、Base URL、模型
4. 在“品宣服务映射”里选择“品宣规划”和“品宣生图”对应模型

## 10. 常见问题

### 10.1 页面打不开

先检查容器：

```bash
docker compose ps
docker compose logs -f santipx
```

再检查健康接口：

```bash
curl http://127.0.0.1:8089/healthz
```

如果健康接口正常，但域名打不开，通常是 Nginx、DNS 或防火墙问题。

### 10.2 Nginx 502

通常是 Docker 服务没启动，或者 Nginx 代理端口写错。

确认 Nginx 里是：

```nginx
proxy_pass http://127.0.0.1:8089;
```

确认容器端口也是 `8089`：

```bash
docker compose ps
```

### 10.3 修改端口

默认端口是 `8089`。

如果一定要改宿主机端口，可以这样启动：

```bash
SANTIPX_PORT=3000 docker compose up -d --build
```

然后 Nginx 也要改成：

```nginx
proxy_pass http://127.0.0.1:3000;
```

### 10.4 AI API 请求失败

先看页面里的错误信息，再看容器日志：

```bash
docker compose logs -f santipx
```

如果服务器访问外部 AI API 必须走代理，可以在 `docker-compose.yml` 里打开这些环境变量：

```yaml
HTTPS_PROXY: http://proxy.example.com:7890
HTTP_PROXY: http://proxy.example.com:7890
NO_PROXY: localhost,127.0.0.1
```

修改后重启：

```bash
docker compose up -d --build --force-recreate
```

### 10.5 用户数据混在一起

正常情况下不会混。

必须确保公司平台跳转时带了正确的 `phone` 参数：

```text
https://px.ks.santisaas.com/?phone=10000000001
```

不同 `phone` 会使用不同的数据空间。

### 10.6 重新清空某个浏览器本地数据

这个项目的数据保存在用户浏览器本地。测试时如果想清空当前浏览器数据：

1. 打开浏览器开发者工具
2. 找到 Application
3. 找到 Local Storage
4. 删除当前域名下的数据
5. 刷新页面

生产环境不要随便让真实用户清理数据。

## 11. 推荐上线检查清单

上线前检查：

- `docker compose ps` 显示服务正常
- `curl http://127.0.0.1:8089/healthz` 返回 `{"ok":true}`
- `nginx -t` 通过
- 域名能访问
- 带 `phone` 参数能进入页面
- 不带 `phone` 参数会弹手机号输入框
- 每个手机号都能单独配置 API 供应商
- 生成图片功能能跑通
