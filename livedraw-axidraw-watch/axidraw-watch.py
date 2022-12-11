from pyaxidraw import axidraw
import time
import os
import sys

def main(folder):
  directory_name = os.path.abspath(os.path.dirname(folder)) 
  sys.path.append(directory_name)
  print("sourcing axidraw_options in", directory_name)
  import axidraw_options
  filepath = os.path.join(directory_name, "files/increment.svg")
  ad = axidraw.AxiDraw()
  
  while True:
    print("wait for file", filepath)
    while not os.path.isfile(filepath):
      time.sleep(0.1)
    
    print("plotting", filepath)
    ad.plot_setup(filepath)
    axidraw_options.set_defaults(ad)
    ad.errors.connect = True
    ad.errors.button = True
    ad.plot_run()

    # delete the file we plotted
    print("removing file", filepath)
    os.remove(filepath)

if __name__ == '__main__':
  filepath = sys.argv[1]
  main(filepath)