import pymupdf 
doc = pymupdf.open("test.pdf") #object 
# makes a place for it to output text 
out = open("output.txt","wb")
for page in doc:
    text = page.get_text().encode("utf8")
    out.write(text)
    out.write(bytes((12,)))
out.close()
print(doc.metadata)