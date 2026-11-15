# Photobooth Camera System

Node.js + WebSocket сервер, Expo Go гар утасны камер, вэб удирдлагын самбар, 7 виртуал камерын simulator ашиглан нэг командаар зураг авах туршилтын систем.

## 1. Системийн боломжууд

- **Sequential:** нэг бодит камераар нэг session-д 8 зураг дараалан авах.
- **Simultaneous:** `CAM1`–`CAM8` нийт 8 холбогдсон камер руу нэг `CAPTURE ALL` команд илгээж, тус бүрээс нэг зураг хүлээн авах.
- **Simulator:** `CAM1` бодит iPhone, `CAM2`–`CAM8` долоон виртуал камер ашиглан турших.
- **Upload & Gallery:** зургуудыг серверийн `uploads/` хавтсанд хадгалж, вэб дээр харах.
- **Өөр сүлжээ:** Cloudflare Tunnel ашиглан өөр Wi-Fi эсвэл 4G/5G сүлжээнээс серверт холбогдох (туршилтын тохиргоо).

> Энэ нь хөгжүүлэлтийн прототип. WebSocket командууд ойролцоо хугацаанд очдог боловч 8 камер яг нэг миллисекундэд зураг авах баталгаа байхгүй. Simulator нь бодит камерын синхрончлолыг шалгахгүй.

## 2. Шаардлагатай програмууд

**Компьютер (Windows):**

1. [Git](https://git-scm.com/downloads) — GitHub-аас төсөл татахад.
2. [Node.js](https://nodejs.org/) — Node.js 20 эсвэл 22 LTS хувилбар санал болгоно. `node` болон `npm` хамт сууна.
3. [Visual Studio Code](https://code.visualstudio.com/) — код нээх, terminal ажиллуулахад.
4. [Cloudflare cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) — зөвхөн өөр сүлжээнээс холбогдох үед.

**Утас (iPhone):**

- App Store-оос **Expo Go** суулгана.
- Камерын зөвшөөрөл өгнө.
- Expo Go-д төслийг QR/линкээр нээнэ. Бусад хэрэглэгчид хөгжүүлэгчийн Expo нууц үгийг авах шаардлагагүй. Private төслийн тохиргоо хандалтыг хязгаарлаж болно.

## 3. GitHub-аас өөр компьютер дээр татах

VS Code-ийн Terminal эсвэл PowerShell нээгээд:

```powershell
git clone https://github.com/USERNAME/REPOSITORY.git
cd REPOSITORY
code .
```

`USERNAME/REPOSITORY`-г өөрийн GitHub repository-ийн URL-аар солино. GitHub дээр хараахан байрлуулаагүй бол төслийн хавтсыг ZIP болгож зөөж, задлаад VS Code-оор нээж болно.

Төслийн хүлээгдэх бүтэц:

```text
photobooth-camera-system/
├── server/
│   ├── index.js
│   ├── simulator.js
│   ├── test-photo.jpg       # simulator ажиллуулахын өмнө өөрөө бэлдэнэ
│   ├── package.json
│   ├── uploads/            # runtime-д зураг хадгалах хавтас
│   └── data/
├── mobile/
│   ├── App.js
│   └── package.json
├── demo-web/
│   └── index.html
└── README.md
```

> `node_modules/`, хувийн зураг, нууц мэдээлэл, runtime upload файлуудыг GitHub-д оруулахгүй. `test-photo.jpg` нь өөрөө бэлдэх тест зураг бөгөөд репод байхгүй байж болно.

## 4. Dependencies суулгах

Төслийн үндсэн хавтаснаас хоёр terminal эсвэл дараах командуудыг дарааллаар ажиллуул:

```powershell
cd server
npm install
cd ..
cd mobile
npm install
cd ..
```

Хэрэв тухайн хавтсанд `package-lock.json` байгаа бол `npm install`-ийн оронд `npm ci` ашиглаж болно. `server/package.json` болон `mobile/package.json` репод байх ёстой.

Шалгах:

```powershell
node -v
npm -v
```

Хэрэв `server`-т `package.json` байхгүй бол эхлээд өмнөх төслийн dependency тохиргоог сэргээх хэрэгтэй; дур мэдэн өөр package хувилбар суулгахгүй.

## 5. Нэг Wi-Fi дээр ажиллуулах (local)

### Terminal 1 — Backend

```powershell
cd server
node index.js
```

Backend нь `http://localhost:3000` дээр ажиллана. Terminal-ийг нээлттэй үлдээнэ.

### Terminal 2 — Web controller

Төслийн үндсэн хавтаснаас:

```powershell
cd demo-web
npx serve -l 5500 .
```

Компьютерийн browser дээр **http://localhost:5500** нээнэ.

### Terminal 3 — Expo mobile app

```powershell
cd mobile
npx expo start --clear
```

iPhone болон PC ижил Wi-Fi-д байхад Expo Go-оор QR код уншуулна. Утасны апп дээр:

- **Server IP or HTTPS URL:** PC-ийн локал IPv4 хаяг, жишээ `192.168.1.78` (энэ нь зөвхөн жишээ; өөрийн IP-г шалга).
- **Session ID:** Web controller дээр үүсгэсэн ID.
- **Camera ID:** `CAM1`.

PC-ийн IPv4 хаягийг PowerShell дээр `ipconfig` командаар харна. Windows Firewall Node.js-д локал сүлжээний хандалт зөвшөөрсөн байх шаардлагатай байж болно.

## 6. 1 бодит утас + 7 simulator турших

1. Web controller дээр **Simultaneous — 8 Phones / 1 Capture** сонгоод **Create Session** дар.
2. iPhone Expo Go дээр ижил Session ID, `CAM1` оруулаад **Connect Camera** дар.
3. `server/test-photo.jpg` файл бэлд: өмнөх тестийн `.jpg` зургийг хуулж нэрийг нь `test-photo.jpg` болго. **Файл `server` хавтсанд, `simulator.js`-тэй зэрэгцээ байна.**
4. Дөрөв дэх terminal дээр:

```powershell
cd server
node simulator.js YOUR_SESSION_ID
```

`YOUR_SESSION_ID`-г web controller-оос авсан жинхэнэ ID-гаар солино.

5. Web controller дээр `CAM1`–`CAM8` бүгд **READY** болсон эсэхийг шалга.
6. **CAPTURE ALL** дар. Амжилттай бол **Capture completed: 8/8** гэж гарч, gallery-д 8 зураг харагдана.

`CAM1` бодит зураг авна. `CAM2`–`CAM8` ижил тест зургийг өөр өөр `cameraId`-тай upload хийнэ.

> Simulator-ийг зогсоох: тухайн terminal дээр `Ctrl + C`.

## 7. Өөр Wi-Fi эсвэл 4G/5G-ээр холбох

Энд **хоёр тусдаа tunnel** хэрэглэнэ:

- **Cloudflare Tunnel:** Node.js backend (`/upload`, WebSocket, session API)-ийг HTTPS/WSS хаягаар гаргана.
- **Expo tunnel:** Expo Go-д хөгжүүлэлтийн аппыг өөр сүлжээнээс нээх боломж олгоно. Expo tunnel нь backend-ийг автоматаар гаргахгүй.

### 7.1 Cloudflare cloudflared суулгах

PowerShell дээр:

```powershell
winget install --id Cloudflare.cloudflared -e
```

Terminal-ийг дахин нээгээд:

```powershell
cloudflared --version
```

### 7.2 Backend + Cloudflare Tunnel

Terminal 1:

```powershell
cd server
node index.js
```

Terminal 2 (төслийн дурын хавтсанд):

```powershell
cloudflared tunnel --url http://localhost:3000
```

Гарсан `https://...trycloudflare.com` URL-ийг хуул. **URL нь жишээ бүрт өөр байж болно.** Terminal-ийг хаавал tunnel зогсоно.

### 7.3 Expo tunnel

Terminal 3:

```powershell
cd mobile
npx expo start --tunnel
```

Шаардлагатай бол Expo-ийн санал болгосон `@expo/ngrok` суулгалтыг зөвшөөр. QR/линкээр Expo Go-д аппыг нээнэ.

### 7.4 Mobile App.js-ийн URL тохиргоо

`mobile/App.js`-д дараах helper байх ёстой (`App` component-ийн гадна):

```javascript
function getServerUrls(value) {
  const input = value.trim().replace(/\/+$/, "");

  if (input.startsWith("https://")) {
    return { http: input, ws: input.replace(/^https:/, "wss:") };
  }
  if (input.startsWith("http://")) {
    return { http: input, ws: input.replace(/^http:/, "ws:") };
  }
  return {
    http: `http://${input}:3000`,
    ws: `ws://${input}:3000`,
  };
}
```

`connect()` дотор WebSocket үүсгэхдээ:

```javascript
const urls = getServerUrls(settings.serverIp);
const ws = new WebSocket(urls.ws);
```

`takePhoto()` дотор upload URL:

```javascript
const urls = getServerUrls(settings.serverIp);
const result = await FileSystem.uploadAsync(
  `${urls.http}/upload`,
  photo.uri,
  { /* ОДООГИЙН uploadAsync options-оо хэвээр хадгал */ }
);
```

> Сүүлийн код нь **зөвхөн URL солих хэсгийн жишээ**. Ажиллаж буй `httpMethod`, `uploadType`, `fieldName`, `mimeType`, `parameters`-ийг устгахгүй.

Утасны **Server IP or HTTPS URL** талбарт Cloudflare-аас гарсан жинхэнэ `https://...trycloudflare.com` хаягийг оруул. Session ID болон Camera ID-г хэвийн ашиглана.

Эхний туршилт: iPhone-ийн Wi-Fi-г унтрааж, mobile data дээр `CAM1`-ээр Connect хийнэ. PC дээр controller-оо `http://localhost:5500`-аар ашиглаж болно: controller болон утас хоёр нэг backend-д өөр өөр замаар холбогдоно.

> Одоогийн `simulator.js` нь `localhost:3000`-д холбогдохоор бичигдсэн. Энэ нь simulator PC дээр backend-тэй хамт ажиллахад зөв. Алсын компьютерээс simulator ажиллуулах бол `SERVER`, `WS_SERVER` хаягийг HTTPS/WSS endpoint-оор тохируулах нэмэлт өөрчлөлт шаардлагатай.

## 8. Нийтлэг алдаа

| Алдаа | Шалгах зүйл |
|---|---|
| `Cannot POST /sessions` | Зөв `server/index.js` ажиллаж байгаа эсэх, backend-ээ дахин асаасан эсэх |
| `server/test-photo.jpg файл олдсонгүй` | `test-photo.jpg` нь `server/simulator.js`-тэй нэг хавтсанд байгаа эсэх |
| `Connection error` | Backend ажиллаж байгаа эсэх, URL зөв эсэх, Cloudflare tunnel нээлттэй эсэх |
| `CAM1` харагдахгүй | Ижил Session ID, Camera ID, камерын permission, WebSocket connection |
| `CAPTURE ALL` идэвхгүй | 8 камер бүгд холбогдож **READY** болсон эсэх |
| Upload failed | `/upload` endpoint, server log, `FileSystem.uploadAsync` URL болон session/request ID |
| Expo Go нээгдэхгүй | `npx expo start --tunnel`, Expo SDK/Expo Go нийцэл, QR/линк, интернет |
| `EADDRINUSE: 3000` | 3000 порт дээр өөр backend процесс ажиллаж байгаа эсэх |

## 9. GitHub-д оруулахын өмнө

Төслийн үндсэн хавтсанд `.gitignore` үүсгэж, дор хаяж:

```gitignore
node_modules/
.expo/
.env
.env.*
server/uploads/
server/data/photos.json
server/test-photo.jpg
```

**Аюулгүй байдал:** Cloudflare quick tunnel нь туршилтад тохиромжтой. Одоогийн backend-д authentication, session-д нэгдэх зөвшөөрөл, upload хэмжээний хязгаарлалт зэрэг хамгаалалт нэмээгүй бол URL-г нийтэд тарааж, хувийн зураг хадгалах production систем болгон ашиглахгүй. Туннель нээлттэй үед хаягийг мэдсэн хүн backend-д хүсэлт илгээх эрсдэлтэй.

## 10. Шуурхай командын санамж

| Terminal | Команд | Зорилго |
|---|---|---|
| 1 | `cd server; node index.js` | Backend |
| 2 | `cd demo-web; npx serve -l 5500 .` | PC controller |
| 3 | `cd mobile; npx expo start --tunnel` | Expo Go (өөр сүлжээ) |
| 4 | `cloudflared tunnel --url http://localhost:3000` | Backend internet tunnel |
| 5 | `cd server; node simulator.js YOUR_SESSION_ID` | CAM2–CAM8 simulator |

> Эдгээр `cd` командууд нь **төслийн үндсэн хавтсаас** ажиллуулж байгаа үед зөв. Аль хэдийн `server`, `mobile`, `demo-web` дотор байгаа бол `cd`-г дахин давтахгүй.
