# backend for dumpy

for endpoints involving triggering AI workflows:
- facial recognition
- caption generation
- music generation
- slideshow generation

set up env vars:
```bash
cp .env.example .env
```
then edit and type in appropriate values

install ffmpeg
mac:
```bash
brew install ffmpeg
```

windows: https://www.ffmpeg.org/download.html

to run dev server:
```bash
fastapi dev main.py
```

`handlers.py` is for request handling / endpoint logic
`schemas.py` is for any data models we may need to use
`core/config.py` is for env vars and config settings
`services/` contains all the service logic and separates each AI responsibility

LETS GOOOOOO