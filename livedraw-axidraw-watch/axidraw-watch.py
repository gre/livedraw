from pyaxidraw import axidraw
import time
import os
import sys

# by convention, a art folder has a files/ folder with SVG files
# and a axidraw_options.py file which can configure extra pen configurations
# we will watch for increment.svg to be created, and then plot it, delete it, and repeat

def main(folder):
  directory_name = os.path.abspath(folder) 
  if not os.path.isdir(directory_name):
    raise Exception("Not a folder: " + directory_name)

  # source the config
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
    axidraw_options.set_defaults(ad) # we apply the art settings
    ad.errors.connect = True # we want to stop everything if the axidraw is disconnected
    ad.errors.button = True # we want to stop everything if the axidraw is paused
    
    # read filepath and search for word '<plotdata'.
    # if found we are "Resuming" to continue from saved position.
    plotdata = False
    with open(filepath, "r") as f:
      for line in f:
        if "<plotdata" in line:
          plotdata = True
          break
    if plotdata:
      ad.options.mode = "res_plot"
    else:
      ad.options.mode = "plot"
    
    # the output is imported to save plotdata for the next increment
    output_svg = ad.plot_run(True)

    # by convention, we save the output to files/increment.finished.svg
    with open(os.path.join(directory_name, "files/increment.finished.svg"), "w") as f:
      f.write(output_svg)

    # delete increment.svg
    os.remove(filepath)


if __name__ == '__main__':
  filepath = sys.argv[1]
  main(filepath)