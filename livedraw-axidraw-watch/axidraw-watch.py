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

    # read filepath and search for word '<plotdata'. true if found
    plotdata = False
    with open(filepath, "r") as f:
      for line in f:
        if "<plotdata" in line:
          plotdata = True
          break
    
    print("plotting", filepath)
    ad.plot_setup(filepath)
    axidraw_options.set_defaults(ad)
    ad.errors.connect = True
    ad.errors.button = True
    
    if plotdata:
      ad.options.mode = "res_plot"
    else:
      ad.options.mode = "plot"
    
    output_svg = ad.plot_run(True)

    # save the output_svg file we plotted
    with open(os.path.join(directory_name, "files/increment.finished.svg"), "w") as f:
      f.write(output_svg)

    # delete increment.svg
    os.remove(filepath)


if __name__ == '__main__':
  filepath = sys.argv[1]
  main(filepath)