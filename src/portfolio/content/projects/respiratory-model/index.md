# "Foreword"

The origins of this project are quite odd, I would say.
This project took me several weeks equivalent of fulltime work, probably 150-200 hours ish.
(so far...)

I stumbled into this, I didn't decide to do it outright.
If you go to the [Mystery](/mystery) page you'll see something about a voxel physics engine.
I was looking at Truncated Octahedra, a type of space filling 3D shape that makes a cool lattice. I was researching the math behind the lattices, and figuring out what other people had done. I was writing code at the time to optimize massive lattice structures.

Anyway, on hackernews there was a comment about someone wanting to use Truncated Octahedra:
![YCombinator Comment](/projects/respiratory-model/ycombinator-comment.png)

So I reached out, he turned out to be a really cool anesthesiologist in Switzerland.
After that, I just got hooked on the idea of making a medical simulation system, and used it as an opportunity to learn and see what I could do. Funny how things happen.

# Respiratory Model & Voxel Simulation Platform

A primitive version of a more universal simulation platform for human anatomy. The project was inspired by voxels and their ability to represent volumetric data in a far more computationally efficient manner than traditional meshes. The ultimate goal is to produce more accurate and performant medical models built on voxel representations — and to get there, a "control" piece of software needed to exist first. This program serves as that control: an interface for a respiratory model that can act as a solid foundation for fairly comparing future innovations against.

## The reference model

The simulation replicates the model of the human conducting airways described in:

> **Generation of an Anatomically Based Three-Dimensional Model of the Conducting Airways**
>
> M. Howatson Tawhai, A. J. Pullan, and P. J. Hunter
>
> Department of Engineering Science, School of Engineering, The University of Auckland, New Zealand
>
> _(Received 6 December 1999; accepted 2 June 2000)_

Throughout this writeup the model is referred to as the "Howat airway," for clarity about its origin and for brevity.

## Performance

The original Howat model took approximately **one hour** to compute. The voxel-based reimplementation produces the same model in:

- **Left lung: 185 ms**
- **Right lung: 188 ms**

From sixty minutes down to under a second. Part of that comes for free from modern processors; the rest comes from the optimizations described below.

---

## How the algorithm works

The model uses voxels to optimize specific stages of the computation while remaining faithful to the geometry produced by the original research. What follows is a walk-through of the algorithm, with the original paper's description quoted alongside each step and the corresponding implementation choices discussed.

### Setting up the volume

Before the algorithm can run, a field of uniform points is generated inside the lung volume. The program first creates a hollow voxel version of the lung mesh, then a foam-filling pass occupies the interior voxels to produce a solid volume. These voxels are then indexed into continuous-space points (each stored as three 32-bit floats). This becomes the "host volume" — the field of points that every later step will partition and re-partition.

The main bronchus is initialized as a single `Branch` based on the model parameters, and the recursion begins.

### The branching steps

> (1) The center of mass of the points contained by a single host lobe is found by averaging the individual coordinate positions.

This is cached on the first generation from the lung-compute volume so it does not have to be recomputed.

> (2) The vector in the direction of the corresponding lobar bronchus and the coordinates of the center of mass are used to define a splitting plane. The splitting plane is extended to the host boundaries, and points on either side of the plane are assigned into two subcollections of points.

Here is where one of the larger optimizations lives. A naive implementation would maintain two separate arrays — one per subcollection — and copy points between them as the recursion descends. Instead, the implementation **re-orders the points in the host volume in-place** so that _Subcollection A_ occupies the first partition of the parent's slice and _Subcollection B_ occupies the second. Each `Subcollection` then stores nothing more than a start index and an end index into the shared host array.

This keeps the entire point cloud in one contiguous buffer for the lifetime of the simulation. Subcollections become cheap views over slices of memory, iteration is sequential and cache-friendly, and no allocations occur during partitioning.

> (3) The center of mass of each subcollection of points is calculated.

The running sum of all points in a subcollection is cached as a 64-bit integer accumulator, so re-deriving the center of mass after a partition does not require iterating the points again — it falls out of the cached sum and the subcollection's length.

> (4) An imaginary line is constructed from the end of the lobar bronchus to each center of mass.
>
> (5) For each subcollection of points a branch is generated from the end of the lobar bronchus, lying on the imaginary line, and extending a defined fractional distance (the "branching fraction") toward the center of mass.
>
> (6) The angle between the projection of the parent branch and the new generated branch is calculated. This is the "branch angle." If the branch angle is greater than an angle limit then the angle is set equal to the limit, such that the resulting branch continues to lie in the plane of its parent branch and the imaginary dividing line.
>
> (7) The length of the branch is calculated. If the length is less than or equal to a length limit, then the branch is a terminal airway.
>
> (8) The position of the branch end is checked to make sure it is inside the host space. If the branch end is outside the host space, then its length is reduced until the end point lies within the host.
>
> (9) The number of grid points in the subcollection is compared with the point number limit. If the number of points is smaller than the limit, then the branch is a terminal airway.

Steps 4 through 9 are direct math — vector projections, angle clamps, length checks. The implementation here just evaluates the parameters and follows the rules.

### The reassignment problem

> (10) When all branching is completed for a single generation, grid points from terminal branches (up to a generation limit) are reassigned to the closest neighboring branches.

This is where the indexed-partition design becomes inconvenient.

If subcollections were just plain arrays, reassignment would be a single line — append the terminal branch's points to its neighbor's:

```
// pseudo code
neighbor_branch
    .subcollection_points
    .extend(terminal_airway.subcollection_points);
```

But because subcollections are indices into a shared host array, "appending" would require re-partitioning every subcollection — an unacceptable cost.

The implementation gets around this by storing **references** instead of moving data. When a terminal airway's points need to be reassigned, a reference to that terminal airway is attached to the nearest neighboring branch. To find the nearest neighbor, the implementation builds a **KD-tree** over the descendant points of non-terminal airways, which makes the nearest-point query efficient.

Of course, future passes of the algorithm — computing centers of mass, lengths, partitioning — now have to traverse those references. The solution is to define those operations **recursively** over a subcollection plus its assigned references. For example, the recursive length and recursive sum used to compute the effective center of mass:

```rust
pub fn recursive_len(&self) -> usize {
    self.len()
        + self
            .assignments
            .borrow()
            .iter()
            .map(|a| a.recursive_len())
            .sum::<usize>()
}

pub fn recursive_sum(&self) -> Vec64 {
    self.sum
        + self
            .assignments
            .borrow()
            .iter()
            .map(|a| a.recursive_sum())
            .sum::<Vec64>()
}

// Effective center of mass:
//   recursive_sum / recursive_len
```

Re-partitioning works the same way: the bisect plane is applied recursively, and the new _Subcollection A_ and _Subcollection B_ slices of each nested assignment are routed to the parent's two new children branches respectively. The end result is identical to the naive append-and-repartition approach, but no point ever moves in memory.

### Termination

> (11) The process continues until all pathways are terminated by a terminal airway.
>
> Diameters are randomly assigned to branches in each Horsfield order using data from Horsfield as mean values, and a coefficient of variation of 0.1.

The diameter assignment in this implementation does **not** use Horsfield order — Horsfield's data is from 1976, and a more up-to-date dataset from 2007 produces more clinically faithful diameters. The replacement source is documented alongside the parameter definitions in the codebase.

---

## Conclusion

This will be worked on in the coming months. I have another unrelated use case for this algorithm, involving VFX and trees. It's called "waybranch"
I'll release that, it's my next "big thing" I've already been working on it for weeks.

The medical aspect of the project is supposed to evolve into stochastic modeling, using millions of simulations to analyze the airflow of various structures. But I haven't really progressed that, so I'll leave it at that.

You can check out the repo if you're interested. I'd be really excited to hear from anyone who has anything at all to say about what I've built!
