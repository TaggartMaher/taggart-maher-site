# How I made this site

This is mainly talking about the process for the desktop emulator view of this website. If you don't know what I'm talking about, go here:

> [Site Settings](/settings)

If you're really fascinated by it, press tilde (~) to mess around with the debug menu. I recommend hiding the page overlay and enabling the draggable square.

## The short answer

Basically, the site works by baking reflection data that includes where the light originated from on the screen. Then, I map that positional data to the live UI at runtime. This gives us the realistic(ish) reflections computed from Blender Cycles render engine, without rendering anything complex on the web browser. This site even runs on integrated GPUs from what I've tested.

## How I got the idea

So it's May 3rd, 2026 at the time I'm writing this. Sometime last week, I was staring at my screen, and it occurred to me that this site should put you in my world and show how I see things. So I took that literally and decided you should be looking at my desk.
I just snapped a photo of my setup and copied it exactly as I saw it.
I wanted it to be a photorealistic scene that gives the illusion of realtime lighting. I immediately had the idea on how to do it because sometimes I use Blender too much and I start to hallucinate my reality is CGI. (gasp)

## The "stack"

I used a trick that I believe originates from game engines, baked reflections. Except, I don't know how to do baked reflections, nor did I really care to learn as I thought had a simple solution that made sense to my simple brain. This was done in a combination of a few technologies:

- Blender (wicked CGI software, Cycles render engine)
- A python script to automate the render setup
- A Rust script to bake the reflection data
- A TypeScript compositor that calls WGSL shaders for the runtime magic
  These technologies end up using 1 static image for the main scene, a system to rasterize the UI of the website, and use shaders to composite the reflections. The "coffee steam" animation uses 24 frames combined on 1 atlas .png image. If you look closely, the light actually seems to refract through the steam.

I originally wanted the whole scene to be an animated video, I spent 2 days working like that. The problem was video compression was annoying which it made the whole thing less cool than I hoped.

---

## Magician Reveals his Secrets

So, take a scene in blender. I just modeled and textured my desk and monitor. The end goal is to somehow get the reflection information that comes from the PC monitor, and know where all the light of these reflections came from on the screen.

> ### _Position Mapping_:
>
> In order to map the correct color to the correct reflections in the scene, we need to know _where_ that light came from. We do this by encoding it using color in the UV positional map.
> The UV positional map (UV just means horozontal and vertical, basically x,y coords) is simply RED and GREEN colors. The more red it is, the closer to the bottom right of the screen.
> GREEN = TOP LEFT
> RED = BOTTOM RIGHT
> BLACK = BOTTOM LEFT
> YELLOW = TOP RIGHT
>
> BLUE is used also, so the actual appearance of the raw position map has a purple / blue color. The blue value is always a value of 1.0 (100% blue). This constant blue color can be separated, it represents the "white light" which helps us understand where shadows are and the brightness of the scene.

Now, when we render in Blender Cycles we get 2 images. One "Beauty" and one "Position" image. The Beauty pass is the entire scene, with all the lighting EXCEPT the screen. The screen is blacked out. We want this, since the screen illumination will be added at runtime by the browser.
The Position image contains a perfect gradient overtop the screen, and gradients around the scene (RED/GREEN/YELLOW color, if you separate the BLUE) which represent which "pixels" went where around the scene.

Once we have those two, we just need the live UI of the screen. We do this by putting the whole UI in to an SVG tag along with the CSS, which the browser can use to draw the UI to an HTML canvas. Once we have the UI on the canvas, then it becomes a compatible image texture which we can use as a uniform in the WGSL shader `u_sampler2D`.
There's a lot more steps to tweak this process to perfection, but the general pipeline just takes the sampled UI image texture, the beauty pass, and the position pass, and combines them.
The sampled UI image gets mapped to the positions based on the UV coordinates, then the color is mixed with the beauty pass.

### How does the UI line up with the monitor.

I just asked Claude to write some code which takes the 4 vertex global positions from the screen plane in blender. Also takes in the camera location and rotation and FOV to a config file, so it just determines the projection that way.
The screen also uses 3D CSS transformations to align it pixel-perfect with our render. Voilà!

## The biggest problem with this design

When I first set up this pipeline, it worked! Kind-of, well, it was very warped. The reflections didn't seem to match the screen, there was banding, and the reflections stretched and scaled completely out of proportion.

Why? Well I don't actually know the specific math behind it. My theory is, in Cycles render, the light bounces will lose some color accuracy. This means, the reflections will only approximate the original position ("pixel" x,y on the PC monitor) as it bounces around. I assume this is due to some precision loss in the light simulation or an intentional compression, since the difference in color is unnoticeable to the human eye, but very noticeable to our position compositor. We can solve this partially by using a gaussian blur (averaging out the nearby pixel colors to reduce noise). This works locally, allowing text render legibly in the reflections. We do this blur in the baking step, because blur algorithms can be expensive at runtime.
However, the overall warping is still pretty bad. The solution I came up with, I call it the "Cellular Position Image".
This is where the python script for blender comes in, it makes this convenient. Basically, it subdivides the screen plane, giving us 144 small planes (I decided this was optimal in my tests for less warping). These planes each have their own gradient, AND they output a separate image. So now we have 144 images when we render. We do this using blender AOVs which allow us to render once, but separate which light came from which "cell."
Why does this help? Basically, we now can isolate smaller sections of the screen, and each cell has a massive contrast in color compared to it's size. This means, any noise / color drifting in the render doesn't cause the position to be that far off. Since, the cell is so small (1/144th the size of the screen) the gaussian blur pretty much makes any positional data loss imperceptible.

## The new bake step

We take all 144 images, and we bake them into one image. We clamp any dark areas to avoid noise, and we essentially pick "which image has the brightest pixel here" for which pixel "owns" the final position of that reflection. The idea is, if the light is brighter for a particular cell, we can assume it had enough samples to reduce noise and get the right position coordinate.
The result is one position image just like before, but virtually zero noise, leading to no perceptible warping in reflections. Yippie!

> **The animated "coffee steam"**
> Yes, the coffee steam needs to do the exact same thing to get decent refraction emulation in the water droplet mist. I just have a script which crops the render, using a render pass which only includes the steam. The result is 3,483 position images (24 frames \*144). Both the static image and animation frames amount to 34GiB of data.

# Final Thoughts

We add an optimized blur at runtime, which blurs the UI sample. If it's too sharp, it looks weird. The coffee steam animation also had to be tweaked to get the right appearance. I can't really remember every decision I made, but the debug menu (press ~) will let you play with all the variables I encountered.

I'm not 100% happy with the result of the reflections, they glitch and aren't that realistic. But, it's still a work of art that I'm proud of as a whole. The technical side could be better, but I only have so much time to justify!

There is also a few optimizations necessary to make this all work, mostly having to do with React rendering, and throttling the compositor loop. If I had to do this over again, I would have used Svelte or plain HTML / TS since React causes performance issues when rendering. But ultimately, this is good enough for what I wanted it to be.

## Future innovations

There is a new browser API proposal which would make this site SO MUCH MORE lightweight to run.
[HTML in Canvas API](https://github.com/WICG/html-in-canvas)
This would skip a few steps, allowing the browser to give me a GPU-ready texture of the UI much more efficiently. I'll implement it if it ever becomes widely adopted by modern browsers.
