from PIL import Image

src = "c:\\xampp\\htdocs\\bk-funil-v7-trafego\\logo_5_anos_transparent.png"
out = "c:\\xampp\\htdocs\\bk-funil-v7-trafego\\bk_5_anos_brown_badge.png"

try:
    img = Image.open(src).convert("RGBA")
    bg = Image.new("RGBA", img.size, "#502314")
    bg.paste(img, (0, 0), img)
    bg.save(out, "PNG")
    print("Done")
except Exception as e:
    print(f"Error: {e}")
