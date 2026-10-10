from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
out=Path(__file__).parent
im=Image.new('RGB',(1600,520),'white');d=ImageDraw.Draw(im)
f=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',58,index=2)
for n,text in enumerate(['工业传感器 温度检测','INDUSTRIAL SENSOR','MODEL TH-204 POWER DC 24V','安全生产 注意防护']):d.text((70,45+n*115),text,font=f,fill='black')
im.save(out/'chinese-english.png');im.transpose(Image.Transpose.ROTATE_270).save(out/'rotated-90.png')

im.transpose(Image.Transpose.ROTATE_270).transpose(Image.Transpose.ROTATE_90).save(out/'rotation-corrected.png')
im2=Image.new('RGB',(1200,220),'white');ImageDraw.Draw(im2).text((50,55),'WAREHOUSE ZX-937  42 BOXES',font=f,fill='black');im2.save(out/'different-input.png')
