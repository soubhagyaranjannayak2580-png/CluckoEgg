# Clucko · free-range farm eggs template

A one-page site for an egg farm. A hen lays a brown egg and a white egg. As you scroll, the same two eggs fly to centre stage, crack open, seal back up and follow you down the page. Then they land in a carton that fills, closes and gets a sticker, and the page opens onto a floating farm. Scroll back up and the whole trip plays in reverse.

Every 3D object is built in code with Three.js. There are no image files and no 3D models, so the whole template is about 200 KB and you can recolour anything in code.

## Run it

It's a static site with no build step. Serve the folder with any static server:

```bash
npx serve .
```

Then open the address it prints. Opening `index.html` straight from disk won't work, because browsers block ES modules on `file://`. Three.js, GSAP and Lenis load from CDNs, so you need an internet connection.

## Where things live

```
index.html          all copy, prices and section markup
css/style.css       colours (top of file), layout, phone and reduced-motion rules
js/app.js           page chrome: smooth scroll, loader, reveals, packs, basket, toasts, steps, farm sky, feathers
js/world.js         the single WebGL canvas: stages, lights, the egg journey, hotspots, pack photos
js/three/
  textures.js       painted canvas textures: shells, pores, feather, glow, pulp fibre, the carton sticker
  egg.js            egg geometry from its true profile, the crackable egg (crack, cap, yolk, glow)
  hen.js            the feathered nest hen and nest, plus low-poly farm hens (6 breeds) and chicks
  carton.js         the moulded-pulp carton: cups, lid, sticker, fill / lid / sticker animations
  farm.js           the floating island: barn, silo, coop, wind pump, pond, trees, animals, clouds
```

## Change the brand

- **Name and copy.** Everything visible is in `index.html`: the headlines, tags, pills, steps, hotspot cards and footer. The loader messages are in `js/app.js` (`MESSAGES`), and the hen's speech bubbles are in `js/world.js` (`PHRASES`).
- **The carton sticker.** It's drawn in `js/three/textures.js` (`drawSticker`). It uses the page fonts and today's date (`todayStamp`). Change `FARM 07 · PUNE` there.
- **Prices.** Each pack card in `index.html` has `data-price-brown` and `data-price-white`. The toggle reads those values.
- **Pack sizes.** The card photos are rendered at load from the real carton model, so they always match the 3D. The sizes it renders are listed in `renderPackShots` in `world.js` (`[6, 10, 12]`), and each card picks its photo by its `data-size`. If you add a size, add it in both places.
- **Colours.** The page colours are the custom properties at the top of `css/style.css`. The 3D colours sit next to the models: `HEN_COLORS` and `BREEDS` in `hen.js`, the shell gradients in `textures.js`, and the pulp colour in `carton.js`. The barn, coop and trees use the colours passed to `std()` and `lowpoly()` in `farm.js`.
- **Fonts.** Fraunces (headlines), Outfit (body) and Caveat (handwritten bits) load from Google Fonts in the `<head>`.

## How the 3D is wired

- There is one fixed, transparent canvas. Each 3D scene (hero, eggs, box, farm) is pinned to an element with `data-stage`. Every frame, its height on screen follows that element, so it scrolls exactly with the page and holds still while the section is pinned. Size and position for desktop and phone are set in the `Act` layouts at the top of `world.js`.
- The eggs' path is a pure function of scroll position. `updateJourney` in `world.js` blends five poses: nest, stage, gutter, cup. The scroll windows for the tags, crack, re-seal, fill, lid, sticker and tip are plain numbers in `updateJourney`, `updateTags` and `updateCarton`, so they're easy to retime.
- The page chrome and the 3D share one clock: Lenis, ScrollTrigger and the render loop all run on the GSAP ticker.
- With `prefers-reduced-motion`, smooth scrolling is off, the eggs skip the laying intro, the carton shows filled and sealed, and CSS animations stop.

## Hooking up a real shop

The basket is a front-end stub. It counts boxes in `localStorage` and shows a toast. Wire the `[data-add]` buttons in `js/app.js` to your cart or checkout, and point the "Book a farm visit" button and the newsletter form at your own endpoints.
