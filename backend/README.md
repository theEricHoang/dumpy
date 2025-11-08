# backend for dumpy

for endpoints involving triggering AI workflows:
- facial recognition
- caption generation
- music generation
- slideshow generation

to run dev server:
```bash
fastapi dev main.py
```

`handlers.py` is for request handling / endpoint logic
`schemas.py` is for any data models we may need to use
`core/config.py` is for env vars and config settings
`services/` contains all the service logic and separates each AI responsibility

LETS GOOOOOO